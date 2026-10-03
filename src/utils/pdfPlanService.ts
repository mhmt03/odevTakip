import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  saveYearlyPlanDocument,
  getYearlyPlanDocument,
  deleteYearlyPlanDocument,
  YearlyPlanDocument,
} from '../database/operations/yearlyPlanOperations';

export const pickAndSaveYearlyPlanPdf = async (
  courseId: number,
  gradeLevel: number
): Promise<{ success: boolean; document?: YearlyPlanDocument; error?: string }> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, error: 'Dosya seçimi iptal edildi.' };
    }

    const asset = result.assets[0];
    const sourceUri = asset.uri;
    const fileName = asset.name || `Yillik_Plan_${gradeLevel}_Sinif.pdf`;
    const fileSize = asset.size || 0;

    // Ensure yearly_plans directory exists
    const dir = `${FileSystem.documentDirectory}yearly_plans/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const targetUri = `${dir}plan_course_${courseId}_grade_${gradeLevel}.pdf`;

    // Check if target already exists and remove it to prevent copyAsync failure
    const targetInfo = await FileSystem.getInfoAsync(targetUri);
    if (targetInfo.exists) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    }

    // Try copying; if copyAsync fails on Android permissions/scoped storage, use fetch -> blob -> writeAsStringAsync fallback
    try {
      await FileSystem.copyAsync({
        from: sourceUri,
        to: targetUri,
      });
    } catch (copyErr) {
      console.warn('copyAsync failed, trying fetch/blob fallback:', copyErr);
      const res = await fetch(sourceUri);
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const str = reader.result as string;
          const cleanB64 = str.includes(',') ? str.split(',')[1] : str;
          resolve(cleanB64);
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(blob);
      });

      await FileSystem.writeAsStringAsync(targetUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // Save metadata in database
    await saveYearlyPlanDocument(courseId, gradeLevel, fileName, targetUri, fileSize);

    const savedDoc = await getYearlyPlanDocument(courseId, gradeLevel);

    return {
      success: true,
      document: savedDoc || undefined,
    };
  } catch (error: any) {
    console.error('pickAndSaveYearlyPlanPdf error:', error);
    return {
      success: false,
      error: error?.message || 'PDF kaydedilirken bir hata oluştu.',
    };
  }
};

export const viewYearlyPlanPdf = async (
  fileUri: string,
  title?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return {
        success: false,
        error: 'PDF dosyası cihaz hafızasında bulunamadı.',
      };
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: title || 'Yıllık Plan PDF',
        UTI: 'com.adobe.pdf',
      });
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Bu cihazda dosya görüntüleme / paylaşma desteği bulunamadı.',
      };
    }
  } catch (error: any) {
    console.error('viewYearlyPlanPdf error:', error);
    return {
      success: false,
      error: error?.message || 'PDF açılırken bir hata oluştu.',
    };
  }
};

export const removeYearlyPlanPdf = async (
  courseId: number,
  gradeLevel: number,
  fileUri?: string
): Promise<void> => {
  try {
    if (fileUri) {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    }
    await deleteYearlyPlanDocument(courseId, gradeLevel);
  } catch (e) {
    console.error('removeYearlyPlanPdf error:', e);
  }
};

export const getCachedPdfJs = async (): Promise<string | null> => {
  try {
    const dir = `${FileSystem.documentDirectory}pdfjs/`;
    const jsPath = `${dir}pdf.min.js`;
    const info = await FileSystem.getInfoAsync(jsPath);
    if (info.exists) {
      return await FileSystem.readAsStringAsync(jsPath);
    }
    // Arka planda bir defaya mahsus indir ve önbelleğe al
    FileSystem.makeDirectoryAsync(dir, { intermediates: true })
      .then(() =>
        FileSystem.downloadAsync(
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
          jsPath
        )
      )
      .catch((err) => console.warn('Background PDF.js download failed:', err));
    return null;
  } catch {
    return null;
  }
};
