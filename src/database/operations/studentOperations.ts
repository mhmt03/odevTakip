import { getDB } from '../db';
import { Student } from '../../types';

export const getStudentsByClass = async (classId: number): Promise<Student[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      id, 
      class_id, 
      student_number, 
      first_name, 
      last_name, 
      (first_name || ' ' || last_name) as full_name,
      notes, 
      created_at 
    FROM students 
    WHERE class_id = ?
    ORDER BY CAST(student_number AS INTEGER) ASC, first_name ASC;
  `;
  return await db.getAllAsync<Student>(query, classId);
};

export const getStudentById = async (studentId: number): Promise<Student | null> => {
  const db = await getDB();
  const query = `
    SELECT 
      id, 
      class_id, 
      student_number, 
      first_name, 
      last_name, 
      (first_name || ' ' || last_name) as full_name,
      notes, 
      created_at 
    FROM students 
    WHERE id = ?;
  `;
  return await db.getFirstAsync<Student>(query, studentId);
};

export const createStudent = async (
  classId: number,
  studentNumber: string,
  firstName: string,
  lastName: string,
  notes?: string
): Promise<number> => {
  const db = await getDB();
  const result = await db.runAsync(
    'INSERT INTO students (class_id, student_number, first_name, last_name, notes) VALUES (?, ?, ?, ?, ?)',
    classId,
    studentNumber.trim(),
    firstName.trim(),
    lastName.trim(),
    notes?.trim() || ''
  );
  return result.lastInsertRowId;
};

export const updateStudent = async (
  id: number,
  studentNumber: string,
  firstName: string,
  lastName: string,
  notes?: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE students SET student_number = ?, first_name = ?, last_name = ?, notes = ? WHERE id = ?',
    studentNumber.trim(),
    firstName.trim(),
    lastName.trim(),
    notes?.trim() || '',
    id
  );
};

export const deleteStudent = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM students WHERE id = ?', id);
};

export interface StudentImportItem {
  studentNumber: string;
  firstName: string;
  lastName: string;
  notes?: string;
}

export const bulkCreateStudents = async (
  classId: number,
  students: StudentImportItem[]
): Promise<{ added: number; skipped: number }> => {
  const db = await getDB();
  let added = 0;
  let skipped = 0;

  await db.withTransactionAsync(async () => {
    for (const s of students) {
      if (!s.firstName && !s.studentNumber) {
        skipped++;
        continue;
      }
      await db.runAsync(
        'INSERT INTO students (class_id, student_number, first_name, last_name, notes) VALUES (?, ?, ?, ?, ?)',
        classId,
        (s.studentNumber || '').trim(),
        (s.firstName || '').trim(),
        (s.lastName || '').trim(),
        (s.notes || '').trim()
      );
      added++;
    }
  });

  return { added, skipped };
};
