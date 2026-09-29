import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Student } from '../types';

export interface PdfExtractedStudentPhoto {
  id: string;
  index: number;
  tempUri: string;
  fileSize: number;
  matchedStudent: Student | null;
  detectedNumber?: string;
}

export interface PdfPhotoExtractResult {
  success: boolean;
  totalImages: number;
  extractedPhotos: PdfExtractedStudentPhoto[];
  error?: string;
}

/**
 * Converts a base64 string to Uint8Array safely in React Native
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * Safely reads PDF bytes from DocumentPickerAsset supporting Android Scoped Storage and Web
 */
async function readPdfBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const uri = asset.uri;

  // 1. Try FileSystem.readAsStringAsync
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    if (b64) {
      return base64ToUint8Array(b64);
    }
  } catch (err) {
    console.warn('readAsStringAsync failed on PDF URI, attempting fallback copy/fetch:', err);
  }

  // 2. Try copying to internal cache directory first (Android Scoped Storage bypass)
  try {
    const tempTarget = `${FileSystem.cacheDirectory}temp_read_${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: tempTarget });
    const b64 = await FileSystem.readAsStringAsync(tempTarget, { encoding: 'base64' });
    await FileSystem.deleteAsync(tempTarget, { idempotent: true });
    if (b64) {
      return base64ToUint8Array(b64);
    }
  } catch (copyErr) {
    console.warn('copyAsync failed on PDF URI, falling back to fetch/blob:', copyErr);
  }

  // 3. Fallback: fetch(uri) -> blob -> FileReader (guaranteed to work across Android ContentResolver)
  const res = await fetch(uri);
  const blob = await res.blob();

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else if (typeof reader.result === 'string') {
          const str = reader.result;
          const cleanB64 = str.includes(',') ? str.split(',')[1] : str;
          resolve(base64ToUint8Array(cleanB64));
        } else {
          reject(new Error('PDF dosyası okunamadı.'));
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    if (typeof reader.readAsArrayBuffer === 'function') {
      reader.readAsArrayBuffer(blob);
    } else {
      reader.readAsDataURL(blob);
    }
  });
}

/**
 * Extracts embedded JPEG images and student numbers from a PDF file.
 */
export const extractPhotosFromPdf = async (
  students: Student[]
): Promise<PdfPhotoExtractResult> => {
  try {
    const pickResult = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
    });

    if (pickResult.canceled || !pickResult.assets || pickResult.assets.length === 0) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'Dosya seçilmedi.' };
    }

    const asset = pickResult.assets[0];

    // Read PDF file as byte array with robust fallbacks
    const bytes = await readPdfBytes(asset);

    if (!bytes || bytes.length === 0) {
      return { success: false, totalImages: 0, extractedPhotos: [], error: 'PDF dosyası okunamadı.' };
    }

    const pdfLength = bytes.length;

    // Ensure cache directory for extracted photos
    const cacheDir = `${FileSystem.cacheDirectory}pdf_photos/`;
    const dirInfo = await FileSystem.getInfoAsync(cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    }

    // 1. Extract embedded JPEG byte slices (SOI: FF D8 FF -> EOI: FF D9)
    const jpegSlices: Uint8Array[] = [];
    let offset = 0;

    while (offset < pdfLength - 3) {
      // JPEG Start of Image: 0xFF, 0xD8, 0xFF
      if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd8 && bytes[offset + 2] === 0xff) {
        let eoi = offset + 3;
        while (eoi < pdfLength - 1) {
          // JPEG End of Image: 0xFF, 0xD9
          if (bytes[eoi] === 0xff && bytes[eoi + 1] === 0xd9) {
            // Filter out tiny icons (real photos are at least 1.2 KB)
            const sliceLen = eoi + 2 - offset;
            if (sliceLen >= 1200) {
              const slice = bytes.subarray(offset, eoi + 2);
              jpegSlices.push(slice);
            }
            offset = eoi + 2;
            break;
          }
          eoi++;
        }
      }
      offset++;
    }

    if (jpegSlices.length === 0) {
      return {
        success: false,
        totalImages: 0,
        extractedPhotos: [],
        error: 'PDF dosyası içinde gömülü fotoğraf bulunamadı.',
      };
    }

    // 2. Try to detect student numbers from PDF raw string
    let latin1Text = '';
    const scanLen = Math.min(bytes.length, 300000);
    const chunkSize = 8192;
    for (let c = 0; c < scanLen; c += chunkSize) {
      const slice = bytes.subarray(c, Math.min(c + chunkSize, scanLen));
      latin1Text += String.fromCharCode.apply(null, slice as any);
    }

    const numberMatches: string[] = [];
    const numberRegex = /\b([0-9]{2,6})\b/g;
    let m: RegExpExecArray | null;
    while ((m = numberRegex.exec(latin1Text)) !== null) {
      numberMatches.push(m[1]);
    }

    // Match extracted numbers that exist in the students list
    const studentNumberSet = new Set(students.map((s) => s.student_number));
    const matchedNumbersInPdf: string[] = [];
    for (const num of numberMatches) {
      if (studentNumberSet.has(num) && !matchedNumbersInPdf.includes(num)) {
        matchedNumbersInPdf.push(num);
      }
    }

    // 3. Save extracted JPEGs to cache files and match with students
    const sortedStudents = [...students].sort((a, b) => {
      const numA = parseInt(a.student_number || '0', 10);
      const numB = parseInt(b.student_number || '0', 10);
      return numA - numB;
    });

    const extractedPhotos: PdfExtractedStudentPhoto[] = [];

    for (let i = 0; i < jpegSlices.length; i++) {
      const slice = jpegSlices[i];
      const sliceBase64 = uint8ArrayToBase64(slice);
      const tempFileName = `pdf_photo_${Date.now()}_${i}.jpg`;
      const tempPath = `${cacheDir}${tempFileName}`;

      await FileSystem.writeAsStringAsync(tempPath, sliceBase64, {
        encoding: 'base64',
      });

      // Match student:
      // Priority 1: Matched by detected numbers in PDF in order
      let matchedStudent: Student | null = null;
      let detectedNum: string | undefined = undefined;

      if (i < matchedNumbersInPdf.length) {
        detectedNum = matchedNumbersInPdf[i];
        matchedStudent = students.find((s) => s.student_number === detectedNum) || null;
      }

      // Priority 2: Match by sequential order in the sorted student list
      if (!matchedStudent && i < sortedStudents.length) {
        matchedStudent = sortedStudents[i];
      }

      extractedPhotos.push({
        id: `extracted-${i}-${Date.now()}`,
        index: i,
        tempUri: tempPath,
        fileSize: slice.byteLength,
        matchedStudent,
        detectedNumber: detectedNum || matchedStudent?.student_number,
      });
    }

    return {
      success: true,
      totalImages: jpegSlices.length,
      extractedPhotos,
    };
  } catch (error: any) {
    console.error('extractPhotosFromPdf error:', error);
    return {
      success: false,
      totalImages: 0,
      extractedPhotos: [],
      error: error?.message || 'PDF işlenirken bir hata oluştu.',
    };
  }
};
