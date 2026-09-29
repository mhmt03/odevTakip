import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { StudentImportItem, ClassBulkImportPayload } from '../database/operations/studentOperations';
import { getClasses } from '../database/operations/classOperations';
import { Student, Assignment, AssignmentStudent, StudentNote, LessonSlot, ScheduleItem, ClassItem, QuizItem, StudentGradeRow } from '../types';
import { createQuiz, bulkSaveGradebookFromExcel } from '../database/operations/gradeOperations';
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
    ['Sıra', 'Tarih', 'Ders Bilgisi', 'Şube', 'Öğrenci No', 'Öğrenci Adı Soyadı', 'Görüş / Değerlendirme'],
  ];

  notes.forEach((n, idx) => {
    data.push([
      idx + 1,
      n.note_date,
      n.lesson_info || '-',
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

// 8. YEARLY PLAN EXCEL IMPORT & TEMPLATE
export interface ParsedYearlyPlanRow {
  weekNumber: number;
  dateStart: string;
  dateEnd: string;
  lessonHours: number;
  subjectTopic: string;
  learningOutcomes: string;
}

const parseExcelDateValue = (val: any): string => {
  if (val === null || val === undefined) return '';

  // 1. If it's a native Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. If it's an Excel date code (number like 45549 or numeric string)
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{4,5}(\.\d+)?$/.test(val.trim()))) {
    const num = typeof val === 'number' ? val : parseFloat(val.trim());
    if (num > 30000 && num < 60000) {
      try {
        const parsed = XLSX.SSF.parse_date_code(num);
        if (parsed) {
          const y = String(parsed.y).padStart(4, '0');
          const m = String(parsed.m).padStart(2, '0');
          const d = String(parsed.d).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch (e) {
        console.warn('SSF.parse_date_code error:', e);
      }
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  // 3. Turkish format: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (e.g. 14.09.2026, 4.9.2026)
  const trMatch = str.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/);
  if (trMatch) {
    const d = trMatch[1].padStart(2, '0');
    const m = trMatch[2].padStart(2, '0');
    const y = trMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 4. Turkish format with 2-digit year: DD.MM.YY (e.g. 14.09.26)
  const trShortMatch = str.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2})$/);
  if (trShortMatch) {
    const d = trShortMatch[1].padStart(2, '0');
    const m = trShortMatch[2].padStart(2, '0');
    const y = `20${trShortMatch[3]}`;
    return `${y}-${m}-${d}`;
  }

  // 5. ISO format: YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD (e.g. 2026-09-14)
  const isoMatch = str.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 6. ISO datetime string with 'T' (e.g. 2026-09-14T00:00:00.000Z)
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  return str;
};

/**
 * Bir hücredeki metinden sınıf seviyesi kodlarıyla başlayan cümleleri veya satırları ayıklar.
 * Gereksiz satırbaşı (\r\n, \n, boşluklar) temizlenir.
 * Örn: "12.4.2.3. Madde oluşum sürecini açıklar.\n\n\n12.4.2.4. Madde ve antimadde kavramlarını açıklar."
 */
export const extractSentencesFromCell = (cellText: string): string[] => {
  if (!cellText || !cellText.trim()) return [];

  const raw = String(cellText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Her cümlenin başında sınıf seviyesi ile başlayan bir kodlama var (örn: 12.4.2.3. veya 9.1.2. vb.)
  // Cümle başlangıç pattern'i: satır başında veya birden fazla boşluktan sonra gelen kodlama:
  const codeRegex = /(?:^|\n|\s{2,}|\b)(\d{1,2}(?:\.\d+){1,4}\.?)/g;

  const indices: Array<{ index: number; code: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = codeRegex.exec(raw)) !== null) {
    const matchIdx = m.index + m[0].indexOf(m[1]);
    indices.push({ index: matchIdx, code: m[1] });
  }

  if (indices.length > 0) {
    const sentences: string[] = [];
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i].index;
      const end = i + 1 < indices.length ? indices[i + 1].index : raw.length;
      const sentenceText = raw.substring(start, end).replace(/\s+/g, ' ').trim();
      if (sentenceText.length > 0) {
        sentences.push(sentenceText);
      }
    }
    if (sentences.length > 0) {
      return sentences;
    }
  }

  // Fallback: Eğer kod bulunamazsa, boş olmayan satırları temizle
  const fallbackLines = raw
    .split(/\n{2,}|\n(?=[A-ZÇĞİÖŞÜ0-9\-\*•])/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  if (fallbackLines.length > 0) return fallbackLines;
  return [raw.replace(/\s+/g, ' ').trim()];
};

/**
 * Toplam cümle sayısını ders saatlerine (H) mümkün olduğunca HOMOJEN olarak paylaştırır.
 *
 * Kullanıcı kuralları:
 * - 4 saat, 4 cümle: [1, 1, 1, 1] saat
 * - 4 saat, 3 cümle: [1, 1, 2] saat (son cümle son iki saate)
 * - 4 saat, 2 cümle: [2, 2] saat (ilk cümle 2 saate, ikinci cümle 2 saate)
 * - 4 saat, 1 cümle: [4] saat
 * - 4 saat, 5 cümle: 1. saat: C1, 2. saat: C2, 3. saat: C3, 4. saat: C4 + C5 (son saate 2 cümle) -> [1, 1, 1, 2]
 * - 4 saat, 6 cümle: 1. saat: C1+C2, 2. saat: C3, 3. saat: C4+C5, 4. saat: C6 -> [2, 1, 2, 1]
 */
export const distributeSentencesToHours = (
  sentences: string[],
  totalHours: number
): Array<{ topic: string; hours: number }> => {
  const N = sentences.length;
  const H = Math.max(1, totalHours || 4);

  if (N === 0) {
    return [{ topic: '', hours: H }];
  }

  // 1. DURUM: Cümle sayısı ders saatinden az veya eşit (N <= H)
  // Her cümle en az 1 saat alır, artan saatler geriden başlayarak eklenir (kullanıcı kuralı: son cümle son 2 saate)
  if (N <= H) {
    const baseHours = Math.floor(H / N);
    let remainder = H % N;

    const hoursPerSentence: number[] = new Array(N).fill(baseHours);
    // Artan saatleri son cümlelerden geriye doğru dağıt (örn: N=3, H=4 -> [1, 1, 2])
    for (let i = N - 1; i >= 0 && remainder > 0; i--, remainder--) {
      hoursPerSentence[i] += 1;
    }

    return sentences.map((sentence, idx) => ({
      topic: sentence,
      hours: hoursPerSentence[idx],
    }));
  }

  // 2. DURUM: Cümle sayısı ders saatinden fazla (N > H)
  // H adet ders saatimiz var, her bir saat 1 saatliktir (hours = 1).
  // Cümleler bu H adet saate homojen şekilde paylaştırılır.
  const sentenceCounts: number[] = new Array(H).fill(Math.floor(N / H));
  const remainder = N % H;

  if (remainder === 1) {
    // 5 cümle, 4 saat: "her derse 1er cümle iken son derse son iki cümle yazılacak" -> [1, 1, 1, 2]
    sentenceCounts[H - 1] += 1;
  } else if (remainder === 2 && H === 4) {
    // 6 cümle, 4 saat: "ilk derse 2 cümle ikinci derse 1 cümle, üçüncü derse 2 cümle ve dördüncü derse de 1 cümle" -> [2, 1, 2, 1]
    sentenceCounts[0] += 1;
    sentenceCounts[2] += 1;
  } else if (remainder > 0) {
    // Genel homojen dağıtım: saatler arasına eşit aralıklarla paylaştır
    let remLeft = remainder;
    for (let i = 0; i < H && remLeft > 0; i++) {
      if (Math.floor(((i + 1) * remainder) / H) > Math.floor((i * remainder) / H)) {
        sentenceCounts[i] += 1;
        remLeft--;
      }
    }
  }

  const result: Array<{ topic: string; hours: number }> = [];
  let sIndex = 0;
  for (let h = 0; h < H; h++) {
    const count = sentenceCounts[h];
    const chunk = sentences.slice(sIndex, sIndex + count);
    sIndex += count;
    result.push({
      topic: chunk.join('\n'),
      hours: 1, // Her bir ders saati 1 saat
    });
  }

  return result;
};

/**
 * Kullanıcı için 4 sütunlu (Tarih, Tarih, Saat, Cümleler) örnek yıllık plan Excel şablonu oluşturur ve paylaşır.
 */
export const generateYearlyPlanTemplateExcel = async (
  courseName: string,
  gradeLevel: number,
  weeklyHours: number = 4
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();

  // Tablo Başlıkları (Türkiye standart formatı GG.AA.YYYY):
  const header = [
    'Hafta Başlangıç Tarihi (GG.AA.YYYY)',
    'Hafta Bitiş Tarihi (GG.AA.YYYY)',
    'Ders Saati',
    'Deftere Yazılacak Konu / Kazanım Cümleleri (Kazanım Kodlu) *',
    'Kazanımlar / Açıklamalar (Opsiyonel)',
  ];

  const rows: any[][] = [header];
  const pad = (n: number) => String(n).padStart(2, '0');
  let monday = new Date(2026, 8, 14); // 14 Eylül 2026 Pazartesi

  // Örnek Haftalar (Kullanıcının yüklediği formatla birebir uyumlu: Hücre içinde kodlu cümleler)
  const samplePlans = [
    {
      sentences: [
        `${gradeLevel}.1.1.1. Madde oluşum sürecini açıklar.`,
        `${gradeLevel}.1.1.2. Madde ve antimadde kavramlarını açıklar.`,
      ],
      desc: 'Madde ve antimadde özellikleri',
    },
    {
      sentences: [
        `${gradeLevel}.1.2.1. Kararlı ve kararsız durumdaki atomların özelliklerini karşılaştırır.`,
        `${gradeLevel}.1.2.2. Radyoaktif bozunma sonucu atomun kütle numarası, atom numarası ve enerjisindeki değişimi açıklar.`,
      ],
      desc: 'Radyoaktif bozunma ve atom yapısı',
    },
    {
      sentences: [
        `${gradeLevel}.1.3.1. Nükleer fisyon ve füzyon olaylarını karşılaştırır.`,
        `${gradeLevel}.1.3.2. Radyasyonun canlılar üzerindeki etkilerini açıklar.`,
        `${gradeLevel}.1.3.3. Radyasyondan korunma yollarını tartışır.`,
      ],
      desc: 'Nükleer enerji ve radyasyon güvenliği',
    },
    {
      sentences: [
        `${gradeLevel}.2.1.1. Özel görelilik teorisinin temel kabullerini açıklar.`,
        `${gradeLevel}.2.1.2. Zaman genişlemesi ve uzunluk büzülmesi kavramlarını tartışır.`,
        `${gradeLevel}.2.1.3. Kütle-enerji eşdeğerliğini matematiksel modelle açıklar.`,
        `${gradeLevel}.2.1.4. Görelilik teorisinin güncel teknolojilerdeki uygulamalarını inceler.`,
      ],
      desc: 'Modern fizik ve görelilik',
    },
    {
      sentences: [
        `${gradeLevel}.3.1.1. Kuantum teorisinin doğuşunu açıklar.`,
      ],
      desc: 'Foton kavramı ve siyah cisim ışıması',
    },
  ];

  for (let w = 1; w <= 36; w++) {
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const startStr = `${pad(monday.getDate())}.${pad(monday.getMonth() + 1)}.${monday.getFullYear()}`;
    const endStr = `${pad(friday.getDate())}.${pad(friday.getMonth() + 1)}.${friday.getFullYear()}`;

    let topicCell = '';
    let outcomeCell = '';

    if (w <= samplePlans.length) {
      const p = samplePlans[w - 1];
      // Cümleleri hücre içinde alt alta ekle (aralarında boşlukla)
      topicCell = p.sentences.join('\n\n');
      outcomeCell = p.desc;
    } else {
      topicCell = `${gradeLevel}.${w}.1.1. ${w}. Hafta Konusu ve temel kavramları açıklar.`;
      outcomeCell = `${w}. Hafta kazanım açıklaması`;
    }

    rows.push([startStr, endStr, weeklyHours || 4, topicCell, outcomeCell]);

    monday.setDate(monday.getDate() + 7);
  }

  const sheetName = `${gradeLevel}. Sınıf Planı`;
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Sütun genişlikleri
  worksheet['!cols'] = [
    { wch: 22 }, // Başlangıç
    { wch: 22 }, // Bitiş
    { wch: 12 }, // Ders Saati
    { wch: 60 }, // Konu
    { wch: 40 }, // Kazanımlar
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Bilgilendirme sayfası
  const infoRows = [
    ['YILLIK MÜFREDAT PLANI EXCEL DOLDURMA VE OTOMATİK DAĞITIM KILAVUZU'],
    [],
    ['Ders Adı:', courseName],
    ['Sınıf Düzeyi:', `${gradeLevel}. Sınıf`],
    ['Haftalık Ders Saati:', `${weeklyHours} Saat`],
    [],
    ['AKILLI CÜMLE AYIKLAMA VE HOMOJEN DERS SAATİ DAĞITIMI:'],
    ['1.', 'Hücre içine birden fazla kazanım cümlesini alt alta yazabilirsiniz.'],
    ['2.', 'Her cümlenin başındaki sınıf seviyesi kodlaması (örn: 12.4.2.3.) otomatik tanınır.'],
    ['3.', 'Gereksiz satırbaşları (enter) ve boşluklar sistem tarafından otomatik temizlenir.'],
    [],
    ['HOMOJEN DAĞITIM ALGORİTMASI ÖRNEKLERİ (Örn: 4 Saatlik Ders İçin):'],
    ['• 4 Cümle:', 'Her 1 derse 1 cümle atanır (1, 1, 1, 1).'],
    ['• 3 Cümle:', '1. derse 1. cümle, 2. derse 2. cümle, son 2 saate ise 3. cümle atanır (1, 1, 2).'],
    ['• 2 Cümle:', 'İlk 2 derse 1. cümle, son 2 derse 2. cümle atanır (2, 2).'],
    ['• 5 Cümle:', 'İlk 3 derse 1er cümle, son derse son 2 cümle atanır (1, 1, 1, 2).'],
    ['• 6 Cümle:', '1. derse 2 cümle, 2. derse 1 cümle, 3. derse 2 cümle, 4. derse 1 cümle atanır (2, 1, 2, 1).'],
    [],
    ['Bu sayede derse girdiğinizde canlı ders kartında tam o derse ait defter metni görünecektir.'],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet['!cols'] = [{ wch: 35 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Kılavuz');

  const cleanCourse = courseName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Yillik_Plan_${gradeLevel}_Sinif_${cleanCourse}_Sablon.xlsx`;
  return await saveAndShareWorkbook(workbook, fileName);
};

/**
 * Kullanıcının seçtiği Excel dosyasından yıllık plan satırlarını okur,
 * hücrelerdeki kodlu cümleleri ayıklar ve haftalık ders saatine göre homojen dağıtır.
 */
export const pickAndParseYearlyPlanExcel = async (): Promise<ParsedYearlyPlanRow[]> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  const asset = result.assets[0];
  const workbook = await readWorkbookFromAsset(asset);

  // İlk çalışma sayfasını al
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('Excel dosyasında geçerli bir sayfa bulunamadı.');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (rawRows.length < 2) {
    throw new Error('Excel dosyasında veri satırı bulunamadı.');
  }

  // Başlık satırını tespit et
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i] || [];
    const joined = row.map((c) => String(c).toLowerCase()).join(' ');
    if (
      joined.includes('konu') ||
      joined.includes('tarih') ||
      joined.includes('başlangıç') ||
      joined.includes('saat') ||
      joined.includes('kazanım')
    ) {
      headerIndex = i;
      break;
    }
  }

  const parsedItems: ParsedYearlyPlanRow[] = [];
  let weekCounter = 1;
  let previousDateStart = '';

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    // Sütun eşleştirme:
    // Kolon 0: Başlangıç Tarihi
    // Kolon 1: Bitiş Tarihi
    // Kolon 2: Ders Saati
    // Kolon 3: Deftere Yazılacak Konu / Cümleler (Hücre içinde 1 veya birden fazla kodlu cümle)
    // Kolon 4: Kazanım / Açıklama (Opsiyonel)
    const col0 = row[0];
    const col1 = row[1];
    const col2 = row[2];
    const col3 = row[3];
    const col4 = row[4];

    const rawTopicCell = col3 !== undefined ? String(col3).trim() : '';
    if (!rawTopicCell) continue;

    const dateStart = parseExcelDateValue(col0);
    const dateEnd = parseExcelDateValue(col1);

    // Zorunlu Ders Saati (col2)
    let weeklyHours = 0;
    if (col2 !== undefined) {
      const parsedHours = parseInt(String(col2).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedHours) && parsedHours > 0) weeklyHours = parsedHours;
    }
    if (weeklyHours <= 0) {
      weeklyHours = 4; // Varsayılan 4 saat
    }

    const learningOutcomes = col4 !== undefined ? String(col4).trim() : '';

    // Akıllı Hafta Numaralandırması:
    // Eğer aynı haftanın tarihleri tekrar ediyorsa aynı hafta numarasını koru
    if (parsedItems.length > 0 && dateStart && dateStart === previousDateStart) {
      // Aynı haftanın devamı
    } else {
      if (parsedItems.length > 0) {
        weekCounter++;
      }
      previousDateStart = dateStart;
    }

    // 1. Hücredeki cümleleri (kodlamaları dikkate alarak ve gereksiz enter'ları temizleyerek) ayıkla:
    const sentences = extractSentencesFromCell(rawTopicCell);

    // 2. Cümleleri haftalık ders saatlerine homojen olarak paylaştır:
    const distributed = distributeSentencesToHours(sentences, weeklyHours);

    // 3. Dağıtılan her bir konuyu plana ekle:
    for (const sub of distributed) {
      parsedItems.push({
        weekNumber: weekCounter,
        dateStart,
        dateEnd,
        lessonHours: sub.hours,
        subjectTopic: sub.topic,
        learningOutcomes,
      });
    }
  }

  if (parsedItems.length === 0) {
    throw new Error(
      'Excel dosyasından geçerli yıllık plan konusu okunamadı. Lütfen şablon sütun sırasını kontrol ediniz.'
    );
  }

  return parsedItems;
};

// 10. GRADEBOOK: Generate template for 3 Exams, 3 Performances and Quizzes
export const generateGradebookTemplateExcel = async (
  className: string,
  term: number,
  students: Student[],
  existingQuizzes: QuizItem[] = []
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();

  const quizTitles = existingQuizzes.length > 0 
    ? existingQuizzes.map((q) => q.title) 
    : ['Quiz 1', 'Quiz 2'];

  const header = [
    'Öğrenci No',
    'Adı',
    'Soyadı',
    '1. Yazılı',
    '2. Yazılı',
    '3. Yazılı',
    '1. Performans',
    '2. Performans',
    '3. Performans',
    ...quizTitles,
  ];

  const data: (string | number)[][] = [
    [`${className} - ${term}. Dönem Not Çizelgesi Şablonu`],
    [
      `Açıklama: Notları (0-100) ilgili sütunlara girip yükleyebilirsiniz. Yeni bir quiz için sütun başlığına "Quiz 3", "Tarama 1" vb. yazabilirsiniz.`,
    ],
    [],
    header,
  ];

  const sorted = [...students].sort((a, b) => {
    const na = parseInt(a.student_number || '0', 10);
    const nb = parseInt(b.student_number || '0', 10);
    return isNaN(na) || isNaN(nb)
      ? (a.student_number || '').localeCompare(b.student_number || '')
      : na - nb;
  });

  sorted.forEach((st) => {
    const row: (string | number)[] = [
      st.student_number || '-',
      st.first_name,
      st.last_name || '',
      '', '', '',
      '', '', '',
      ...quizTitles.map(() => ''),
    ];
    data.push(row);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, `${term}. Dönem Notlar`);
  const cleanName = className.replace(/[^a-zA-Z0-9_-]/g, '_');
  return await saveAndShareWorkbook(workbook, `Not_Sablonu_${cleanName}_${term}_Donem.xlsx`);
};

// 11. GRADEBOOK: Export full gradebook to Excel
export const exportClassGradebookToExcel = async (
  className: string,
  term: number,
  gradebook: { students: StudentGradeRow[]; quizzes: QuizItem[] }
): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();

  const quizHeaders = gradebook.quizzes.map((q) => q.title);

  const header = [
    'Sıra',
    'Öğrenci No',
    'Adı Soyadı',
    '1. Yazılı',
    '2. Yazılı',
    '3. Yazılı',
    'Yazılı Ort.',
    '1. Performans',
    '2. Performans',
    '3. Performans',
    'Perf. Ort.',
    ...quizHeaders,
    'Quiz Ort.',
    'Genel Ortalama',
  ];

  const data: (string | number)[][] = [
    [`${className} - ${term}. Dönem Not Çizelgesi`],
    [`Tarih: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
    [],
    header,
  ];

  gradebook.students.forEach((st, idx) => {
    const quizValues = gradebook.quizzes.map((q) => {
      const val = st.quizScores[q.id];
      return val !== null && val !== undefined ? val : '-';
    });

    data.push([
      idx + 1,
      st.student_number || '-',
      `${st.first_name} ${st.last_name}`,
      st.exam1 ?? '-',
      st.exam2 ?? '-',
      st.exam3 ?? '-',
      st.examAvg ?? '-',
      st.perf1 ?? '-',
      st.perf2 ?? '-',
      st.perf3 ?? '-',
      st.perfAvg ?? '-',
      ...quizValues,
      st.quizAvg ?? '-',
      st.overallAvg ?? '-',
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, `${term}. Dönem Notlar`);
  const cleanName = className.replace(/[^a-zA-Z0-9_-]/g, '_');
  return await saveAndShareWorkbook(workbook, `Not_Cizelgesi_${cleanName}_${term}_Donem.xlsx`);
};

// 12. GRADEBOOK: Pick and parse Excel to update student grades and quizzes
export const pickAndParseGradebookExcel = async (
  classId: number,
  term: number,
  students: Student[],
  existingQuizzes: QuizItem[]
): Promise<{
  success: boolean;
  error?: string;
  updatedCount: number;
  newQuizzesCreated: string[];
}> => {
  try {
    const docRes = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
    });

    if (docRes.canceled || !docRes.assets || docRes.assets.length === 0) {
      return { success: false, error: 'Dosya seçilmedi.', updatedCount: 0, newQuizzesCreated: [] };
    }

    const fileUri = docRes.assets[0].uri;
    const base64Content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(base64Content, { type: 'base64' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rows || rows.length < 2) {
      return {
        success: false,
        error: 'Excel dosyası boş veya okunamadı.',
        updatedCount: 0,
        newQuizzesCreated: [],
      };
    }

    // Find header row: look for row containing "Öğrenci No", "No", or "Yazılı"
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i];
      if (Array.isArray(r)) {
        const text = r.map((c) => String(c || '').toLowerCase().trim()).join(' ');
        if (text.includes('no') || text.includes('yazılı') || text.includes('ad')) {
          headerRowIdx = i;
          break;
        }
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0;
    }

    const headerRow = rows[headerRowIdx] || [];

    // Map column indices
    let noCol = -1;
    let exam1Col = -1;
    let exam2Col = -1;
    let exam3Col = -1;
    let perf1Col = -1;
    let perf2Col = -1;
    let perf3Col = -1;

    // Quizzes: col index -> quiz title
    const quizCols: Array<{ colIdx: number; title: string }> = [];

    for (let c = 0; c < headerRow.length; c++) {
      const rawHeader = String(headerRow[c] || '').trim();
      const norm = rawHeader.toLowerCase().replace(/[\s._-]+/g, '');

      if (
        norm === 'öğrencino' ||
        norm === 'okulno' ||
        norm === 'no' ||
        norm === 'numara' ||
        norm === 'ogrno'
      ) {
        if (noCol === -1) noCol = c;
      } else if (norm.includes('1yazılı') || norm === 'y1' || norm === 'yazılı1' || norm === '1sınav') {
        exam1Col = c;
      } else if (norm.includes('2yazılı') || norm === 'y2' || norm === 'yazılı2' || norm === '2sınav') {
        exam2Col = c;
      } else if (norm.includes('3yazılı') || norm === 'y3' || norm === 'yazılı3' || norm === '3sınav') {
        exam3Col = c;
      } else if (
        norm.includes('1performans') ||
        norm === 'p1' ||
        norm === 'performans1' ||
        norm.includes('1etkinlik')
      ) {
        perf1Col = c;
      } else if (
        norm.includes('2performans') ||
        norm === 'p2' ||
        norm === 'performans2' ||
        norm.includes('2etkinlik')
      ) {
        perf2Col = c;
      } else if (
        norm.includes('3performans') ||
        norm === 'p3' ||
        norm === 'performans3' ||
        norm.includes('3etkinlik')
      ) {
        perf3Col = c;
      } else if (
        norm.includes('quiz') ||
        norm.includes('tarama') ||
        norm.includes('kısasınav') ||
        norm.startsWith('q')
      ) {
        quizCols.push({ colIdx: c, title: rawHeader || `Quiz ${quizCols.length + 1}` });
      }
    }

    if (noCol === -1) {
      return {
        success: false,
        error:
          'Excel dosyasında öğrenci numarası ("Öğrenci No", "Okul No" veya "No") sütunu bulunamadı.',
        updatedCount: 0,
        newQuizzesCreated: [],
      };
    }

    // Ensure or match quizzes
    const quizMap = new Map<number, number>(); // colIdx -> quizId
    const newQuizzesCreated: string[] = [];

    for (const qCol of quizCols) {
      let matchedQuiz = existingQuizzes.find(
        (eq) => eq.title.trim().toLowerCase() === qCol.title.trim().toLowerCase()
      );
      if (!matchedQuiz) {
        const newQuizId = await createQuiz(classId, term, qCol.title);
        matchedQuiz = {
          id: newQuizId,
          class_id: classId,
          term,
          title: qCol.title,
          max_score: 100,
        };
        newQuizzesCreated.push(qCol.title);
      }
      quizMap.set(qCol.colIdx, matchedQuiz.id);
    }

    // Map student numbers to Student objects
    const studentMap = new Map<string, Student>();
    for (const st of students) {
      if (st.student_number) {
        studentMap.set(st.student_number.trim(), st);
        studentMap.set(String(parseInt(st.student_number.trim(), 10)), st);
      }
    }

    const parseScore = (val: any): number | null => {
      if (val === undefined || val === null || val === '' || val === '-') return null;
      const num = parseFloat(String(val).replace(',', '.'));
      if (isNaN(num)) return null;
      return Math.min(100, Math.max(0, Math.round(num * 10) / 10));
    };

    const updateRecords: Array<{
      studentId: number;
      exam1?: number | null;
      exam2?: number | null;
      exam3?: number | null;
      perf1?: number | null;
      perf2?: number | null;
      perf3?: number | null;
      quizScores?: Record<number, number | null>;
    }> = [];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !Array.isArray(row)) continue;

      const rawNo = String(row[noCol] || '').trim();
      if (!rawNo) continue;

      const student = studentMap.get(rawNo) || studentMap.get(String(parseInt(rawNo, 10)));
      if (!student) continue;

      const rec: (typeof updateRecords)[0] = {
        studentId: student.id,
      };

      if (exam1Col !== -1) rec.exam1 = parseScore(row[exam1Col]);
      if (exam2Col !== -1) rec.exam2 = parseScore(row[exam2Col]);
      if (exam3Col !== -1) rec.exam3 = parseScore(row[exam3Col]);
      if (perf1Col !== -1) rec.perf1 = parseScore(row[perf1Col]);
      if (perf2Col !== -1) rec.perf2 = parseScore(row[perf2Col]);
      if (perf3Col !== -1) rec.perf3 = parseScore(row[perf3Col]);

      if (quizCols.length > 0) {
        rec.quizScores = {};
        for (const qCol of quizCols) {
          const quizId = quizMap.get(qCol.colIdx);
          if (quizId) {
            rec.quizScores[quizId] = parseScore(row[qCol.colIdx]);
          }
        }
      }

      updateRecords.push(rec);
    }

    if (updateRecords.length === 0) {
      return {
        success: false,
        error:
          'Şubedeki öğrencilerle eşleşen numara bulunamadı. Lütfen öğrenci numaralarını kontrol ediniz.',
        updatedCount: 0,
        newQuizzesCreated: [],
      };
    }

    const { updatedCount } = await bulkSaveGradebookFromExcel(classId, term, updateRecords);

    return {
      success: true,
      updatedCount,
      newQuizzesCreated,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Excel dosyası işlenirken bir hata oluştu.',
      updatedCount: 0,
      newQuizzesCreated: [],
    };
  }
};
