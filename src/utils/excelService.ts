import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { StudentImportItem } from '../database/operations/studentOperations';
import { Student, Assignment, AssignmentStudent, StudentNote, LessonSlot, ScheduleItem } from '../types';
import { formatDateToTR, DAYS_OF_WEEK } from './dateUtils';

// Helper to save and share excel buffer
const saveAndShareWorkbook = async (workbook: XLSX.WorkBook, fileName: string): Promise<boolean> => {
  try {
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

// 1. IMPORT: Pick and parse Excel file for students
export const pickAndParseStudentsExcel = async (): Promise<StudentImportItem[]> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  const fileUri = result.assets[0].uri;
  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const workbook = XLSX.read(fileBase64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) return [];

  // Find header row index
  let headerIndex = -1;
  let colNumber = -1;
  let colFirstName = -1;
  let colLastName = -1;
  let colFullName = -1;
  let colNotes = -1;

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (cell.includes('numara') || cell.includes('öğrenci no') || cell === 'no' || cell === 'ogr no') {
        colNumber = c;
      } else if (cell === 'ad' || cell === 'öğrenci adı' || cell === 'adı' || cell === 'isim') {
        colFirstName = c;
      } else if (cell === 'soyad' || cell === 'öğrenci soyadı' || cell === 'soyadı') {
        colLastName = c;
      } else if (cell === 'ad soyad' || cell === 'öğrenci ad soyad' || cell === 'adı soyadı' || cell === 'ad ve soyad') {
        colFullName = c;
      } else if (cell.includes('not') || cell.includes('açıklama')) {
        colNotes = c;
      }
    }

    if (colNumber !== -1 || colFirstName !== -1 || colFullName !== -1) {
      headerIndex = r;
      break;
    }
  }

  const parsedStudents: StudentImportItem[] = [];
  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let num = '';
    let fName = '';
    let lName = '';
    let notes = '';

    if (headerIndex !== -1) {
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
      // Fallback heuristics: column 0 = number, 1 = firstname, 2 = lastname
      num = String(row[0] || '').trim();
      fName = String(row[1] || '').trim();
      lName = String(row[2] || '').trim();
    }

    if (fName || num) {
      parsedStudents.push({
        studentNumber: num,
        firstName: fName,
        lastName: lName,
        notes,
      });
    }
  }

  return parsedStudents;
};

// 2. TEMPLATE: Generate sample Excel template
export const generateStudentTemplateExcel = async (): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();
  const templateData = [
    ['Okul No', 'Ad', 'Soyad', 'Notlar'],
    ['101', 'Ahmet', 'Yılmaz', ''],
    ['102', 'Ayşe', 'Kaya', ''],
    ['103', 'Mehmet', 'Demir', ''],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(templateData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Şablonu');
  return await saveAndShareWorkbook(workbook, 'siniftakip_ogrenci_sablonu.xlsx');
};

// 3. EXPORT: Class student roster
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

// 4. EXPORT: Homework / Assignment report
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
    [`Açıklama: ${assignment.description || '-'}`],
    [],
    ['Öğrenci No', 'Ad Soyad', 'Ödev Durumu', 'Muafiyet', 'Öğretmen Notu'],
  ];

  students.forEach((s) => {
    let statusText = 'Bekliyor';
    if (s.is_exempt === 1) statusText = 'Muaf';
    else if (s.status === 'yapildi') statusText = 'Yapıldı';
    else if (s.status === 'yapilmadi') statusText = 'Yapılmadı';
    else if (s.status === 'eksik') statusText = 'Eksik';

    data.push([
      s.student_number || '-',
      `${s.first_name} ${s.last_name}`,
      statusText,
      s.is_exempt === 1 ? 'Evet' : 'Hayır',
      s.note || '',
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ödev Sonuçları');
  const cleanTitle = (assignment.title || 'Odev').replace(/[^a-zA-Z0-9_-]/g, '_');
  return await saveAndShareWorkbook(workbook, `Odev_Raporu_${cleanTitle}.xlsx`);
};

// 5. EXPORT: Student notes / observations report
export const exportStudentNotesToExcel = async (notes: StudentNote[]): Promise<boolean> => {
  const workbook = XLSX.utils.book_new();
  const data: (string | number)[][] = [
    ['Öğrenci Görüş ve Değerlendirme Raporu'],
    [`Rapor Tarihi: ${formatDateToTR(new Date().toISOString().split('T')[0])}`],
    [],
    ['Sıra', 'Şube', 'No', 'Öğrenci Ad Soyad', 'Tarih ve Saat', 'Öğretmen Görüşü / Notu'],
  ];

  notes.forEach((n, idx) => {
    data.push([
      idx + 1,
      n.class_name || '-',
      n.student_number || '-',
      n.student_name || '-',
      formatDateToTR(n.note_date),
      n.note,
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Görüşleri');
  return await saveAndShareWorkbook(workbook, 'Ogrenci_Gorus_Raporu.xlsx');
};

// 6. EXPORT: Weekly Schedule
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
        row.push(`${match.class_name || ''} - ${match.course_name || ''}`);
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
