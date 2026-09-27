import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Student } from '../types';

export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB limit
export const MAX_PHOTO_SIZE_LABEL = '2 MB';

const getPhotosDirectory = async (): Promise<string> => {
  const dir = `${FileSystem.documentDirectory}student_photos/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
};

/**
 * Saves a picked image file permanently to app's document directory
 */
export const savePhotoPermanently = async (
  tempUri: string,
  studentNumberOrId: string | number
): Promise<string> => {
  const dir = await getPhotosDirectory();
  // Get extension from tempUri or default to jpg
  const cleanUri = tempUri.split('?')[0];
  const extMatch = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

  const filename = `student_${studentNumberOrId}_${Date.now()}.${ext}`;
  const targetPath = `${dir}${filename}`;

  await FileSystem.copyAsync({
    from: tempUri,
    to: targetPath,
  });

  return targetPath;
};

/**
 * Checks file size in bytes
 */
export const getFileSizeBytes = async (uri: string): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') {
      return info.size;
    }
    return 0;
  } catch {
    return 0;
  }
};

/**
 * Pick a single photo using Camera or Gallery
 */
export const pickSinglePhotoFromSource = async (
  source: 'camera' | 'gallery'
): Promise<{ uri: string; size: number } | null> => {
  let result: ImagePicker.ImagePickerResult;

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Kamera izni verilmedi.');
    }
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Galeri erişim izni verilmedi.');
    }
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  let size = asset.fileSize || 0;
  if (!size) {
    size = await getFileSizeBytes(asset.uri);
  }

  return {
    uri: asset.uri,
    size,
  };
};

export interface MatchedPhotoItem {
  student: Student;
  fileUri: string;
  fileName: string;
  fileSize: number;
}

export interface UnmatchedPhotoItem {
  fileName: string;
  extractedNumber: string;
  reason: 'not_found' | 'oversized';
  fileSize: number;
}

export interface BulkPhotoMatchResult {
  totalFiles: number;
  matched: MatchedPhotoItem[];
  unmatched: UnmatchedPhotoItem[];
  oversizedCount: number;
}

/**
 * Matches multiple picked image files with students based on filename = student_number
 */
export const matchPhotosWithStudents = async (
  files: { uri: string; name: string; size?: number }[],
  students: Student[]
): Promise<BulkPhotoMatchResult> => {
  const matched: MatchedPhotoItem[] = [];
  const unmatched: UnmatchedPhotoItem[] = [];
  let oversizedCount = 0;

  // Build a lookup map of student_number -> Student (trimmed, case-insensitive)
  const studentMap = new Map<string, Student>();
  for (const s of students) {
    if (s.student_number) {
      studentMap.set(s.student_number.trim().toLowerCase(), s);
    }
  }

  for (const file of files) {
    let size = file.size || 0;
    if (!size) {
      size = await getFileSizeBytes(file.uri);
    }

    // Extract student number from filename:
    // e.g. "102.jpg" -> "102", "045.png" -> "045", "102_ahmet.jpeg" -> "102"
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').trim();
    // Match digits or exact string
    let extractedNumber = nameWithoutExt;
    const digitMatch = nameWithoutExt.match(/^(\d+)/);
    if (digitMatch) {
      extractedNumber = digitMatch[1];
    }

    // Check size limit (MAX_PHOTO_SIZE_BYTES)
    if (size > MAX_PHOTO_SIZE_BYTES) {
      oversizedCount++;
      unmatched.push({
        fileName: file.name,
        extractedNumber,
        reason: 'oversized',
        fileSize: size,
      });
      continue;
    }

    // Find student by extractedNumber
    const student =
      studentMap.get(extractedNumber.toLowerCase()) ||
      studentMap.get(nameWithoutExt.toLowerCase()) ||
      // Also try matching by stripping leading zeros (e.g. "045" -> "45")
      studentMap.get(String(parseInt(extractedNumber, 10)));

    if (student) {
      matched.push({
        student,
        fileUri: file.uri,
        fileName: file.name,
        fileSize: size,
      });
    } else {
      unmatched.push({
        fileName: file.name,
        extractedNumber,
        reason: 'not_found',
        fileSize: size,
      });
    }
  }

  return {
    totalFiles: files.length,
    matched,
    unmatched,
    oversizedCount,
  };
};

/**
 * Pick multiple photos from folder/storage using DocumentPicker
 */
export const pickBulkPhotosFromDevice = async (): Promise<
  { uri: string; name: string; size?: number }[]
> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets) {
    return [];
  }

  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    size: a.size,
  }));
};
