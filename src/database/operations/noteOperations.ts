import { getDB } from '../db';
import { StudentNote } from '../../types';
import { getCurrentDateTimeString } from '../../utils/dateUtils';
import { getCurrentActiveLessonSummary } from './scheduleOperations';

export const getNotesByStudent = async (studentId: number): Promise<StudentNote[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      sn.id,
      sn.student_id,
      sn.class_id,
      (s.first_name || ' ' || s.last_name) as student_name,
      s.student_number,
      c.name as class_name,
      sn.note,
      sn.note_date,
      sn.lesson_info,
      sn.created_at
    FROM student_notes sn
    JOIN students s ON s.id = sn.student_id
    JOIN classes c ON c.id = sn.class_id
    WHERE sn.student_id = ?
    ORDER BY sn.note_date DESC, sn.id DESC;
  `;
  return await db.getAllAsync<StudentNote>(query, studentId);
};

export const getNotesByClass = async (classId: number): Promise<StudentNote[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      sn.id,
      sn.student_id,
      sn.class_id,
      (s.first_name || ' ' || s.last_name) as student_name,
      s.student_number,
      c.name as class_name,
      sn.note,
      sn.note_date,
      sn.lesson_info,
      sn.created_at
    FROM student_notes sn
    JOIN students s ON s.id = sn.student_id
    JOIN classes c ON c.id = sn.class_id
    WHERE sn.class_id = ?
    ORDER BY sn.note_date DESC, sn.id DESC;
  `;
  return await db.getAllAsync<StudentNote>(query, classId);
};

export const getAllNotes = async (): Promise<StudentNote[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      sn.id,
      sn.student_id,
      sn.class_id,
      (s.first_name || ' ' || s.last_name) as student_name,
      s.student_number,
      c.name as class_name,
      sn.note,
      sn.note_date,
      sn.lesson_info,
      sn.created_at
    FROM student_notes sn
    JOIN students s ON s.id = sn.student_id
    JOIN classes c ON c.id = sn.class_id
    ORDER BY sn.note_date DESC, sn.id DESC;
  `;
  return await db.getAllAsync<StudentNote>(query);
};

export const createNote = async (
  studentId: number,
  classId: number,
  note: string,
  noteDate?: string,
  lessonInfo?: string | null
): Promise<number> => {
  const db = await getDB();
  const dateToUse = noteDate || getCurrentDateTimeString();

  let finalLessonInfo = lessonInfo;
  if (finalLessonInfo === undefined) {
    try {
      const active = await getCurrentActiveLessonSummary();
      finalLessonInfo = active ? active.fullText : null;
    } catch {
      finalLessonInfo = null;
    }
  }

  const res = await db.runAsync(
    'INSERT INTO student_notes (student_id, class_id, note, note_date, lesson_info) VALUES (?, ?, ?, ?, ?)',
    studentId,
    classId,
    note.trim(),
    dateToUse,
    finalLessonInfo || null
  );
  return res.lastInsertRowId;
};

export const updateNote = async (
  id: number,
  note: string,
  noteDate?: string,
  lessonInfo?: string | null
): Promise<void> => {
  const db = await getDB();
  if (noteDate !== undefined && lessonInfo !== undefined) {
    await db.runAsync(
      'UPDATE student_notes SET note = ?, note_date = ?, lesson_info = ? WHERE id = ?',
      note.trim(),
      noteDate,
      lessonInfo,
      id
    );
  } else if (noteDate !== undefined) {
    await db.runAsync(
      'UPDATE student_notes SET note = ?, note_date = ? WHERE id = ?',
      note.trim(),
      noteDate,
      id
    );
  } else {
    await db.runAsync('UPDATE student_notes SET note = ? WHERE id = ?', note.trim(), id);
  }
};

export const deleteNote = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM student_notes WHERE id = ?', id);
};

// --- QUICK OBSERVATION PRESETS (Hızlı Görüş Şablonları) ---
export interface QuickNoteItem {
  id: number;
  text: string;
  sort_order?: number;
}

export const getQuickNotes = async (): Promise<QuickNoteItem[]> => {
  const db = await getDB();
  return await db.getAllAsync<QuickNoteItem>(
    'SELECT * FROM quick_notes ORDER BY sort_order ASC, id ASC'
  );
};

export const addQuickNote = async (text: string): Promise<number> => {
  const db = await getDB();
  const maxOrderRow = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) as max_order FROM quick_notes'
  );
  const nextOrder = (maxOrderRow?.max_order || 0) + 1;
  const res = await db.runAsync(
    'INSERT INTO quick_notes (text, sort_order) VALUES (?, ?)',
    text.trim(),
    nextOrder
  );
  return res.lastInsertRowId;
};

export const updateQuickNote = async (id: number, text: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE quick_notes SET text = ? WHERE id = ?', text.trim(), id);
};

export const deleteQuickNote = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM quick_notes WHERE id = ?', id);
};

export const resetDefaultQuickNotes = async (): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM quick_notes');
  const starterQuickNotes = [
    'Derste çok aktifti 👍',
    'Ödevini getirmedi ❌',
    'Derste konuştu / dikkati dağınıktı ⚠️',
    'Soruları doğru çözdü ⭐',
    'Dersi dikkatle dinledi 📖',
    'Rehberlik görüşmesi yapıldı 💬',
    'Söz hakkı aldı ve katkı sağladı 👏',
    'Kitap / defter getirmedi 📚',
  ];
  for (let i = 0; i < starterQuickNotes.length; i++) {
    await db.runAsync(
      'INSERT INTO quick_notes (text, sort_order) VALUES (?, ?)',
      starterQuickNotes[i],
      i + 1
    );
  }
};
