import { getDB } from '../db';
import { StudentNote } from '../../types';
import { getCurrentDateTimeString } from '../../utils/dateUtils';

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
  noteDate?: string
): Promise<number> => {
  const db = await getDB();
  const dateToUse = noteDate || getCurrentDateTimeString();
  const res = await db.runAsync(
    'INSERT INTO student_notes (student_id, class_id, note, note_date) VALUES (?, ?, ?, ?)',
    studentId,
    classId,
    note.trim(),
    dateToUse
  );
  return res.lastInsertRowId;
};

export const updateNote = async (id: number, note: string, noteDate?: string): Promise<void> => {
  const db = await getDB();
  if (noteDate) {
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
