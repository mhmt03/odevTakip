import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { StudentImportItem, ClassBulkImportPayload } from '../database/operations/studentOperations';
import { getClasses } from '../database/operations/classOperations';
import { Student, Assignment, AssignmentStudent, StudentNote, LessonSlot, ScheduleItem, ClassItem } from '../types';
import { formatDateToTR, DAYS_OF_WEEK } from './dateUtils';

// Helper to save and share excel workbook across Web and Native
export const saveAndShareWorkbook = async (workbook: XLSX.WorkBook, fileName: string): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const excelBuffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    const filePath = `${dir}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, excelBuffer, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Excel Dosyasını Paylaş',
        UTI: 'com.microsoft.excel.xlsx',
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving/sharing Excel:', error);
    throw error;
  }
};

// Robust helper to read Excel workbook from picked asset on Web and Native
export const readWorkbookFromAsset = async (asset: DocumentPicker.DocumentPickerAsset): Promise<XLSX.WorkBook> => {
  try {
    // 1. Web Environment
    if (Platform.OS === 'web') {
      if (asset.file) {
        const ab = await asset.file.arrayBuffer();
        return XLSX.read(ab, { type: 'array' });
      }
      const res = await fetch(asset.uri);
      const ab = await res.arrayBuffer();
      return XLSX.read(ab, { type: 'array' });
    }

    // 2. Native Environment: Try FileSystem.readAsStringAsync (Base64)
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (base64) {
        return XLSX.read(base64, { type: 'base64' });
      }
    } catch (fsError) {
      console.warn('FileSystem.readAsStringAsync failed, falling back to fetch/blob:', fsError);
    }

    // 3. Fallback: fetch(asset.uri) -> blob -> base64
    const res = await fetch(asset.uri);
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const str = reader.result as string;
        const cleanB64 = str.includes(',') ? str.split(',')[1] : str;
        resolve(cleanB64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return XLSX.read(base64, { type: 'base64' });
  } catch (error: any) {
    console.error('readWorkbookFromAsset error:', error);
    throw new Error(
      `Excel dosyası çözümlenemedi. Dosyanın bozuk olmadığından ve geçerli bir Excel (.xlsx, .xls) formatında olduğundan emin olunuz. (${error?.message || error})`
    );
  }
};

// 1. IMPORT: Pick and parse Excel file for students (Supports both single-class and multi-class)
export const pickAndParseStudentsExcel = async (): Promise<StudentImportItem[]> => {
  let result;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/octet-stream',
        '*/*',
      ],
      copyToCacheDirectory: true,
    });
  } catch (err: any) {
    console.error('DocumentPicker error:', err);
    throw new Error('Dosya seçici açılamadı: ' + (err?.message || err));
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  const asset = result.assets[0];
  const workbook = await readWorkbookFromAsset(asset);

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Seçilen Excel dosyasında herhangi bir çalışma sayfası bulunamadı.');
  }

  // Find the primary student sheet (look for 'Öğrenci Listesi' or 'Öğrenciler' or use first sheet)
  let sheetName = workbook.SheetNames[0];
  const preferredSheet = workbook.SheetNames.find(
    (name) =>
      name.toLowerCase().includes('öğrenci') ||
      name.toLowerCase().includes('ogrenci') ||
      name.toLowerCase().includes('liste') ||
      name.toLowerCase().includes('student')
  );
  if (preferredSheet) {
    sheetName = preferredSheet;
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('Excel sayfa içeriği okunamadı.');
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('Excel çalışma sayfası boş görünüyor.');
  }

  // Find header row index
  let headerIndex = -1;
  let colClass = -1;
  let colNumber = -1;
  let colFirstName = -1;
  let colLastName = -1;
  let colFullName = -1;
  let colNotes = -1;

  for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (
        cell === 'şube' ||
        cell === 'sube' ||
        cell === 'sınıf' ||
        cell === 'sinif' ||
        cell.includes('şube adı') ||
        cell.includes('sube adi') ||
        cell === 'class'
      ) {
        colClass = c;
      } else if (
        cell.includes('numara') ||
        cell.includes('öğrenci no') ||
        cell.includes('ogrenci no') ||
        cell === 'no' ||
        cell === 'ogr no' ||
        cell === 'okul no'
      ) {
        colNumber = c;
      } else if (
        cell === 'ad' ||
        cell === 'öğrenci adı' ||
        cell === 'ogrenci adi' ||
        cell === 'adı' ||
        cell === 'adi' ||
        cell === 'isim' ||
        cell === 'first name'
      ) {
        colFirstName = c;
      } else if (
        cell === 'soyad' ||
        cell === 'öğrenci soyadı' ||
        cell === 'ogrenci soyadi' ||
        cell === 'soyadı' ||
        cell === 'soyadi' ||
        cell === 'last name'
      ) {
        colLastName = c;
      } else if (
        cell === 'ad soyad' ||
        cell === 'öğrenci ad soyad' ||
        cell === 'adı soyadı' ||
        cell === 'ad ve soyad' ||
        cell === 'adi soyadi' ||
        cell === 'full name'
      ) {
        colFullName = c;
      } else if (
        cell.includes('not') ||
        cell.includes('açıklama') ||
        cell.includes('aciklama')
      ) {
        colNotes = c;
      }
    }

    if (colNumber !== -1 || colFirstName !== -1 || colFullName !== -1 || colClass !== -1) {
      headerIndex = r;
      break;
    }
  }

  const parsedStudents: StudentImportItem[] = [];
  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let className = '';
    let num = '';
    let fName = '';
    let lName = '';
    let notes = '';

    if (headerIndex !== -1) {
      if (colClass !== -1 && row[colClass] !== undefined) {
        className = String(row[colClass]).trim();
      }
      if (colNumber !== -1 && row[colNumber] !== undefined) {
        num = String(row[colNumber]).trim();
      }
      if (colFullName !== -1 && row[colFullName] !== undefined) {
        const full = String(row[colFullName]).trim();
        const parts = full.split(' ');
        if (parts.length > 1) {
          lName = parts.pop() || '';
          fName = parts.join(' ');
        } else {
          fName = full;
        }
      } else {
        if (colFirstName !== -1 && row[colFirstName] !== undefined) {
          fName = String(row[colFirstName]).trim();
        }
        if (colLastName !== -1 && row[colLastName] !== undefined) {
          lName = String(row[colLastName]).trim();
        }
      }
      if (colNotes !== -1 && row[colNotes] !== undefined) {
        notes = String(row[colNotes]).trim();
      }
    } else {
      // Fallback heuristics: column 0 = Class or Number, 1 = First name, 2 = Last name
      num = String(row[0] || '').trim();
      fName = String(row[1] || '').trim();
      lName = String(row[2] || '').trim();
    }

    // Filter out completely blank rows or title rows
    if (fName || num) {
      parsedStudents.push({
        className: className || undefined,
        studentNumber: num,
        firstName: fName,
        lastName: lName,
        notes,
      });
    }
  }

  return parsedStudents;
};

// 2. VALIDATION HELPER: Group and validate students for bulk import into all classes
export interface BulkImportValidation {
  validPayloads: ClassBulkImportPayload[];
  unmatchedClasses: { rawClassName: string; count: number }[];
  missingClassStudents: StudentImportItem[];
  totalStudents: number;
  validCount: number;
}

export const validateBulkStudentImport = (
  students: StudentImportItem[],
  existingClasses: ClassItem[]
): BulkImportValidation => {
  const classMap = new Map<string, ClassItem>();
  existingClasses.forEach((c) => {
    classMap.set(c.name.trim().toLowerCase(), c);
  });

  const grouped = new Map<number, { classItem: ClassItem; students: StudentImportItem[] }>();
  const unmatchedMap = new Map<string, number>();
  const missingClassStudents: StudentImportItem[] = [];

  for (const s of students) {
    const rawClass = (s.className || '').trim();
    if (!rawClass) {
      missingClassStudents.push(s);
      continue;
    }

    const matched = classMap.get(rawClass.toLowerCase());
    if (matched) {
      if (!grouped.has(matched.id)) {
        grouped.set(matched.id, { classItem: matched, students: [] });
      }
      grouped.get(matched.id)!.students.push(s);
    } else {
      unmatchedMap.set(rawClass, (unmatchedMap.get(rawClass) || 0) + 1);
    }
  }

  const validPayloads: ClassBulkImportPayload[] = [];
  let validCount = 0;
  grouped.forEach(({ classItem, students: classStudents }) => {
    validPayloads.push({
      classId: classItem.id,
      className: classItem.name,
      students: classStudents,
    });
    validCount += classStudents.length;
  });

  const unmatchedClasses: { rawClassName: string; count: number }[] = [];
  unmatchedMap.forEach((count, rawClassName) => {
    unmatchedClasses.push({ rawClassName, count });
  });

  return {
    validPayloads,
    unmatchedClasses,
    missingClassStudents,
    totalStudents: students.length,
    validCount,
  };
};

// 3. TEMPLATE: Generate multi-sheet sample Excel template with registered classes
export const generateStudentTemplateExcel = async (): Promise<boolean> => {
  const existingClasses = await getClasses();

  const workbook = XLSX.utils.book_new();

  // SHEET 1: Öğrenci Listesi
  const sampleClass1 = existingClasses.length > 0 ? existingClasses[0].name : '12-A';
  const sampleClass2 = existingClasses.length > 1 ? existingClasses[1].name : (existingClasses.length > 0 ? existingClasses[0].name : '10-B');

  const templateData = [
    ['Şube', 'Okul No', 'Ad', 'Soyad', 'Notlar'],
    [sampleClass1, '101', 'Ahmet', 'Yılmaz', ''],
    [sampleClass1, '102', 'Ayşe', 'Kaya', ''],
    [sampleClass2, '201', 'Mehmet', 'Demir', ''],
    [sampleClass2, '202', 'Zeynep', 'Çelik', ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(templateData);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Listesi');

  // SHEET 2: Kayıtlı Şubeler (Kullanıcının hatalı sınıf girmesini önleyen rehber liste)
  const classesSheetData: (string | number)[][] = [
    ['SİSTEMDE KAYITLI ŞUBELER'],
    ['ÖNEMLİ: 1. sayfadaki "Şube" sütununa yalnızca aşağıda listelenen şube adlarını birebir aynı şekilde yazınız.'],
    [],
    ['Şube Adı', 'Şube Açıklaması', 'Mevcut Öğrenci Sayısı'],
  ];

  if (existingClasses.length > 0) {
    existingClasses.forEach((c) => {
      classesSheetData.push([c.name, c.description || '-', c.student_count || 0]);
    });
  } else {
    classesSheetData.push([
      'Henüz kayıtlı şube yok',
      'Lütfen önce uygulamadan "Yeni Şube" ekleyiniz.',
      0,
    ]);
  }

  const classesWorksheet = XLSX.utils.aoa_to_sheet(classesSheetData);
  classesWorksheet['!cols'] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(workbook, classesWorksheet, 'Kayıtlı Şubeler');

  return await saveAndShareWorkbook(workbook, 'toplu_ogrenci_yukleme_sablonu.xlsx');
};

// 4. EXPORT: Class student roster
export const exportClassStudentsToExcel = async (
  className: string,
  students: Student[]
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();
  const data: (string | number)[][] = [
    [`Şube: ${className} - Öğrenci Listesi`],
    [`Tarih: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
    [],
    ['Sıra', 'Öğrenci No', 'Adı', 'Soyadı', 'Notlar'],
  ];

  students.forEach((s, idx) => {
    data.push([idx + 1, s.student_number || '-', s.first_name, s.last_name || '', s.notes || '']);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, className);
  const cleanName = className.replace(/[^a-zA-Z0-9_-]/g, '_');
  return await saveAndShareWorkbook(workbook, `Ogrenci_Listesi_${cleanName}.xlsx`);
};

// 5. EXPORT: Homework / Assignment report
export const exportAssignmentToExcel = async (
  assignment: Assignment,
  students: AssignmentStudent[]
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();
  const data: (string | number)[][] = [
    [`Ödev Raporu: ${assignment.title}`],
    [`Şube: ${assignment.class_name || '-'}`],
    [`Verilme Tarihi: ${formatDateToTR(assignment.assigned_date)}`],
    [`Teslim Tarihi: ${formatDateToTR(assignment.due_date)}`],
    [],
    ['Sıra', 'Öğrenci No', 'Adı Soyadı', 'Ödev Durumu', 'Muaf', 'Öğretmen Notu'],
  ];

  students.forEach((st, idx) => {
    const statusLabel =
      st.status === 'yapildi'
        ? 'Yapıldı'
        : st.status === 'yapilmadi'
        ? 'Yapılmadı'
        : st.status === 'eksik'
        ? 'Eksik'
        : st.status === 'muaf'
        ? 'Muaf'
        : 'Bekliyor';

    data.push([
      idx + 1,
      st.student_number || '-',
      `${st.first_name} ${st.last_name}`,
      statusLabel,
      st.is_exempt === 1 ? 'Evet' : 'Hayır',
      st.note || '',
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ödev Sonuçları');
  const cleanTitle = assignment.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);
  return await saveAndShareWorkbook(workbook, `Odev_${cleanTitle}.xlsx`);
};

// 6. EXPORT: Student notes / observations report
export const exportStudentNotesToExcel = async (notes: StudentNote[]): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();
  const data: (string | number)[][] = [
    ['Öğrenci Görüş ve Değerlendirme Kayıtları'],
    [`Rapor Tarihi: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
    [],
    ['Sıra', 'Tarih', 'Şube', 'Öğrenci No', 'Öğrenci Adı Soyadı', 'Görüş / Değerlendirme'],
  ];

  notes.forEach((n, idx) => {
    data.push([
      idx + 1,
      n.note_date,
      n.class_name || '-',
      n.student_number || '-',
      n.student_name || '-',
      n.note,
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Görüşleri');
  return await saveAndShareWorkbook(workbook, 'Ogrenci_Gorus_Raporu.xlsx');
};

// 7. EXPORT: Weekly Schedule
export const exportScheduleToExcel = async (
  slots: LessonSlot[],
  scheduleItems: ScheduleItem[]
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();

  // Header row: Saat, Pazartesi, Salı, Çarşamba, Perşembe, Cuma, Cumartesi
  const header = ['Ders / Saat', ...DAYS_OF_WEEK.slice(0, 5).map((d) => d.name)];
  const rows: string[][] = [
    ['HAFTALIK ÖĞRETMEN DERS PROGRAMI'],
    [`Oluşturulma Tarihi: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
    [],
    header,
  ];

  slots.forEach((slot) => {
    const row = [`${slot.slot_name} (${slot.start_time}-${slot.end_time})`];
    for (let day = 1; day <= 5; day++) {
      const match = scheduleItems.find(
        (item) => item.slot_id === slot.id && item.day_of_week === day
      );
      if (match && (match.class_name || match.course_name)) {
        let text = `${match.class_name || ''} - ${match.course_name || ''}`;
        if (match.is_custom_time && match.start_time && match.end_time) {
          text += ` (${match.start_time}-${match.end_time})`;
        }
        row.push(text);
      } else if (match && match.is_custom_time && match.start_time && match.end_time) {
        row.push(`- (${match.start_time}-${match.end_time})`);
      } else {
        row.push('-');
      }
    }
    rows.push(row);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ders Programı');
  return await saveAndShareWorkbook(workbook, 'Haftalik_Ders_Programi.xlsx');
};
