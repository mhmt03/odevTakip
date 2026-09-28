import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { getDB, closeDatabase, initDatabase } from '../database/db';

export interface DatabaseStats {
  classCount: number;
  studentCount: number;
  assignmentCount: number;
  noteCount: number;
  scheduleCount: number;
  yearlyPlanCount: number;
  quickNoteCount: number;
}

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    const enc4 = b3 & 63;

    base64 +=
      chars[enc1] +
      chars[enc2] +
      (i + 1 < len ? chars[enc3] : '=') +
      (i + 2 < len ? chars[enc4] : '=');
  }
  return base64;
};

const getTimestampString = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
};

export const getDatabaseStats = async (): Promise<DatabaseStats> => {
  try {
    const db = await getDB();
    const classRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM classes');
    const studentRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM students');
    const assignmentRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM assignments');
    const noteRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM student_notes');
    const scheduleRow = await db.getFirstAsync<{ count: number }>(
      'SELECT count(*) as count FROM schedules WHERE class_id IS NOT NULL OR course_id IS NOT NULL'
    );
    const yearlyPlanRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM yearly_plans');
    const quickNoteRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM quick_notes');

    return {
      classCount: classRow?.count || 0,
      studentCount: studentRow?.count || 0,
      assignmentCount: assignmentRow?.count || 0,
      noteCount: noteRow?.count || 0,
      scheduleCount: scheduleRow?.count || 0,
      yearlyPlanCount: yearlyPlanRow?.count || 0,
      quickNoteCount: quickNoteRow?.count || 0,
    };
  } catch (error) {
    console.error('getDatabaseStats error:', error);
    return {
      classCount: 0,
      studentCount: 0,
      assignmentCount: 0,
      noteCount: 0,
      scheduleCount: 0,
      yearlyPlanCount: 0,
      quickNoteCount: 0,
    };
  }
};

export const exportDatabaseBackup = async (
  action: 'share' | 'download'
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const db = await getDB();
    let dbContentBase64 = '';

    // First attempt: serializeAsync
    try {
      // @ts-ignore - expo-sqlite serializeAsync
      if (typeof db.serializeAsync === 'function') {
        // @ts-ignore
        const bytes: Uint8Array = await db.serializeAsync('main');
        dbContentBase64 = uint8ArrayToBase64(bytes);
      }
    } catch (serializeErr) {
      console.warn('serializeAsync failed, attempting file read fallback:', serializeErr);
    }

    // Fallback if serializeAsync didn't produce content
    if (!dbContentBase64) {
      const sqlitePath = `${FileSystem.documentDirectory}SQLite/sinif_takip.db`;
      const fileInfo = await FileSystem.getInfoAsync(sqlitePath);
      if (fileInfo.exists) {
        dbContentBase64 = await FileSystem.readAsStringAsync(sqlitePath, {
          // @ts-ignore
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        throw new Error('Veritabanı dosyası fiziksel olarak bulunamadı.');
      }
    }

    const backupFileName = `sinif_takip_yedek_${getTimestampString()}.db`;

    if (action === 'download' && Platform.OS === 'android') {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const directoryUri = permissions.directoryUri;
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            directoryUri,
            backupFileName,
            'application/x-sqlite3'
          );
          await FileSystem.writeAsStringAsync(fileUri, dbContentBase64, {
            // @ts-ignore
            encoding: FileSystem.EncodingType.Base64,
          });
          return {
            success: true,
            message: `Veritabanı yedeği seçtiğiniz klasöre başarıyla kaydedildi:\n${backupFileName}`,
          };
        } else {
          return {
            success: false,
            message: 'Klasör seçimi yapılmadığı için indirme iptal edildi.',
          };
        }
      } catch (safErr) {
        console.warn('SAF error, falling back to share:', safErr);
      }
    }

    // Default or Share action
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    const tempFilePath = `${cacheDir}${backupFileName}`;

    await FileSystem.writeAsStringAsync(tempFilePath, dbContentBase64, {
      // @ts-ignore
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tempFilePath, {
        mimeType: 'application/x-sqlite3',
        dialogTitle: `Veritabanı Yedeğini Paylaş: ${backupFileName}`,
        UTI: 'application/x-sqlite3',
      });
      return {
        success: true,
        message: 'Yedek dosyası hazırlandı ve paylaşım penceresi açıldı.',
      };
    } else {
      return {
        success: true,
        message: `Yedek dosyası oluşturuldu: ${tempFilePath}`,
      };
    }
  } catch (error: any) {
    console.error('exportDatabaseBackup error:', error);
    return {
      success: false,
      error: error?.message || 'Veritabanı yedeklenirken bilinmeyen bir hata oluştu.',
    };
  }
};

export const restoreDatabaseBackup = async (): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/x-sqlite3', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: 'Dosya seçimi iptal edildi.' };
    }

    const selectedAsset = result.assets[0];
    const sourceUri = selectedAsset.uri;

    // Safety backup of current database
    try {
      const db = await getDB();
      // @ts-ignore
      if (typeof db.serializeAsync === 'function') {
        // @ts-ignore
        const safetyBytes: Uint8Array = await db.serializeAsync('main');
        const safetyBase64 = uint8ArrayToBase64(safetyBytes);
        const safetyPath = `${FileSystem.cacheDirectory}guvenlik_yedek_${getTimestampString()}.db`;
        await FileSystem.writeAsStringAsync(safetyPath, safetyBase64, {
          // @ts-ignore
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch (e) {
      console.warn('Güvenlik yedeği alınamadı (işleme devam ediliyor):', e);
    }

    // Close open database instance
    await closeDatabase();

    const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
    const targetDbPath = `${sqliteDir}sinif_takip.db`;

    const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    }

    // Copy new file over target SQLite database
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetDbPath,
    });

    // Re-initialize database
    await initDatabase();

    return {
      success: true,
      message: 'Veritabanı başarıyla geri yüklendi. Tüm kayıtlarınız güncellendi.',
    };
  } catch (error: any) {
    console.error('restoreDatabaseBackup error:', error);
    try {
      await initDatabase();
    } catch (reInitErr) {
      console.error('Failed to re-initialize after error:', reInitErr);
    }
    return {
      success: false,
      error: error?.message || 'Geri yükleme işlemi sırasında bir hata meydana geldi.',
    };
  }
};
