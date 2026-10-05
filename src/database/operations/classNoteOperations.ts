import { getDB } from '../db';
import { ClassNote } from '../../types';
import { getCurrentDateTimeString } from '../../utils/dateUtils';
import { getCurrentActiveLessonSummary } from './scheduleOperations';

export const ensureClassNotesTable = async (): Promise<void> => {
  const db = await getDB();
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS class_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        note TEXT NOT NULL,
        note_date TEXT NOT NULL,
        lesson_info TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      );
    `);
  } catch (e) {
    console.error('Error creating class_notes table:', e);
  }
};

export const getClassNotes = async (classId: number): Promise<ClassNote[]> => {
  await ensureClassNotesTable();
  const db = await getDB();
  const query = `
    SELECT 
      cn.id,
      cn.class_id,
      c.name as class_name,
      cn.note,
      cn.note_date,
      cn.lesson_info,
      cn.created_at
    FROM class_notes cn
    JOIN classes c ON c.id = cn.class_id
    WHERE cn.class_id = ?
    ORDER BY cn.note_date DESC, cn.id DESC;
  `;
  return await db.getAllAsync<ClassNote>(query, classId);
};

export const createClassNote = async (
  classId: number,
  note: string,
  noteDate?: string,
  lessonInfo?: string | null
): Promise<number> => {
  await ensureClassNotesTable();
  const db = await getDB();
  const dateToUse = noteDate || getCurrentDateTimeString();

  let finalLessonInfo = lessonInfo;
  if (finalLessonInfo === undefined) {
    try {
      const active = await getCurrentActiveLessonSummary();
      finalLessonInfo = active
        ? `${active.fullText} (${active.startTime} - ${active.endTime})`
        : null;
    } catch {
      finalLessonInfo = null;
    }
  }

  const res = await db.runAsync(
    'INSERT INTO class_notes (class_id, note, note_date, lesson_info, created_at) VALUES (?, ?, ?, ?, ?)',
    classId,
    note.trim(),
    dateToUse,
    finalLessonInfo || null,
    dateToUse
  );
  return res.lastInsertRowId;
};

export const updateClassNote = async (
  id: number,
  note: string,
  noteDate?: string,
  lessonInfo?: string | null
): Promise<void> => {
  await ensureClassNotesTable();
  const db = await getDB();
  if (noteDate !== undefined && lessonInfo !== undefined) {
    await db.runAsync(
      'UPDATE class_notes SET note = ?, note_date = ?, lesson_info = ? WHERE id = ?',
      note.trim(),
      noteDate,
      lessonInfo || null,
      id
    );
  } else if (noteDate !== undefined) {
    await db.runAsync(
      'UPDATE class_notes SET note = ?, note_date = ? WHERE id = ?',
      note.trim(),
      noteDate,
      id
    );
  } else {
    await db.runAsync('UPDATE class_notes SET note = ? WHERE id = ?', note.trim(), id);
  }
};

export const deleteClassNote = async (id: number): Promise<void> => {
  await ensureClassNotesTable();
  const db = await getDB();
  await db.runAsync('DELETE FROM class_notes WHERE id = ?', id);
};
