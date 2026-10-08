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
      grade_level,
      notes, 
      photo_uri, 
      created_at 
    FROM students 
    WHERE class_id = ?
    ORDER BY CAST(student_number AS INTEGER) ASC, first_name ASC;
  `;
  return await db.getAllAsync<Student>(query, classId);
};

export interface StudentWithClass extends Student {
  class_name?: string;
  grade_level?: number;
}

export const getAllStudentsWithClass = async (): Promise<StudentWithClass[]> => {
  const db = await getDB();
  const activeSchool = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE is_active = 1 LIMIT 1');
  const schoolId = activeSchool?.id || 1;

  const query = `
    SELECT 
      s.id, 
      s.class_id, 
      s.student_number, 
      s.first_name, 
      s.last_name, 
      (s.first_name || ' ' || last_name) as full_name,
      COALESCE(s.grade_level, c.grade_level) as grade_level,
      s.notes, 
      s.photo_uri,
      s.created_at,
      c.name as class_name
    FROM students s
    INNER JOIN classes c ON s.class_id = c.id
    WHERE c.school_id = ? OR c.school_id IS NULL
    ORDER BY c.name ASC, CAST(s.student_number AS INTEGER) ASC, s.first_name ASC;
  `;
  return await db.getAllAsync<StudentWithClass>(query, schoolId);
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
      grade_level,
      notes, 
      photo_uri,
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
  notes?: string,
  photoUri?: string | null,
  gradeLevel?: number
): Promise<number> => {
  const db = await getDB();

  let finalGradeLevel = gradeLevel;
  if (finalGradeLevel === undefined) {
    const cls = await db.getFirstAsync<{ grade_level: number; name: string }>(
      'SELECT grade_level, name FROM classes WHERE id = ?',
      classId
    );
    if (cls) {
      finalGradeLevel = cls.grade_level ?? (cls.name.match(/^(\d{1,2})/)?.[1] ? parseInt(cls.name.match(/^(\d{1,2})/)![1], 10) : undefined);
    }
  }

  const result = await db.runAsync(
    'INSERT INTO students (class_id, student_number, first_name, last_name, notes, photo_uri, grade_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
    classId,
    studentNumber.trim(),
    firstName.trim(),
    lastName.trim(),
    notes?.trim() || '',
    photoUri || null,
    finalGradeLevel ?? null
  );
  return result.lastInsertRowId;
};

export const updateStudent = async (
  id: number,
  studentNumber: string,
  firstName: string,
  lastName: string,
  notes?: string,
  photoUri?: string | null
): Promise<void> => {
  const db = await getDB();
  if (photoUri !== undefined) {
    await db.runAsync(
      'UPDATE students SET student_number = ?, first_name = ?, last_name = ?, notes = ?, photo_uri = ? WHERE id = ?',
      studentNumber.trim(),
      firstName.trim(),
      lastName.trim(),
      notes?.trim() || '',
      photoUri,
      id
    );
  } else {
    await db.runAsync(
      'UPDATE students SET student_number = ?, first_name = ?, last_name = ?, notes = ? WHERE id = ?',
      studentNumber.trim(),
      firstName.trim(),
      lastName.trim(),
      notes?.trim() || '',
      id
    );
  }
};

export const updateStudentPhoto = async (
  studentId: number,
  photoUri: string | null
): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE students SET photo_uri = ? WHERE id = ?', photoUri, studentId);
};

export const bulkUpdateStudentPhotos = async (
  matches: { studentId: number; photoUri: string }[]
): Promise<number> => {
  const db = await getDB();
  let updatedCount = 0;
  await db.withTransactionAsync(async () => {
    for (const m of matches) {
      await db.runAsync('UPDATE students SET photo_uri = ? WHERE id = ?', m.photoUri, m.studentId);
      updatedCount++;
    }
  });
  return updatedCount;
};

export const clearStudentPhotosByClass = async (classId: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE students SET photo_uri = NULL WHERE class_id = ?', classId);
};

export const clearAllStudentPhotos = async (): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE students SET photo_uri = NULL');
};

export const deleteStudent = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM students WHERE id = ?', id);
};

export const bulkDeleteStudents = async (studentIds: number[]): Promise<void> => {
  if (!studentIds || studentIds.length === 0) return;
  const db = await getDB();
  const placeholders = studentIds.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM students WHERE id IN (${placeholders})`, ...studentIds);
};

export const deleteAllStudentsByClass = async (classId: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM students WHERE class_id = ?', classId);
};

export const deleteAllStudentsGlobally = async (): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM students');
};

export const bulkTransferStudents = async (
  studentIds: number[],
  targetClassId: number
): Promise<void> => {
  if (!studentIds || studentIds.length === 0) return;
  const db = await getDB();
  const placeholders = studentIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE students SET class_id = ? WHERE id IN (${placeholders})`,
    targetClassId,
    ...studentIds
  );
};

export interface StudentImportItem {
  studentNumber: string;
  firstName: string;
  lastName: string;
  notes?: string;
  className?: string;
  gradeLevel?: number;
}

export const bulkCreateStudents = async (
  classId: number,
  students: StudentImportItem[]
): Promise<{ added: number; skipped: number }> => {
  const db = await getDB();
  let added = 0;
  let skipped = 0;

  const cls = await db.getFirstAsync<{ grade_level: number; name: string }>(
    'SELECT grade_level, name FROM classes WHERE id = ?',
    classId
  );
  const defaultGrade = cls?.grade_level ?? (cls?.name.match(/^(\d{1,2})/)?.[1] ? parseInt(cls.name.match(/^(\d{1,2})/)![1], 10) : undefined);

  await db.withTransactionAsync(async () => {
    for (const s of students) {
      if (!s.firstName && !s.studentNumber) {
        skipped++;
        continue;
      }
      const studentGrade = s.gradeLevel ?? defaultGrade ?? null;
      await db.runAsync(
        'INSERT INTO students (class_id, student_number, first_name, last_name, notes, grade_level) VALUES (?, ?, ?, ?, ?, ?)',
        classId,
        (s.studentNumber || '').trim(),
        (s.firstName || '').trim(),
        (s.lastName || '').trim(),
        (s.notes || '').trim(),
        studentGrade
      );
      added++;
    }
  });

  return { added, skipped };
};

export interface ClassBulkImportPayload {
  classId: number;
  className: string;
  students: StudentImportItem[];
}

export const bulkCreateStudentsMultipleClasses = async (
  payloads: ClassBulkImportPayload[]
): Promise<{ totalAdded: number; details: { className: string; added: number }[] }> => {
  const db = await getDB();
  let totalAdded = 0;
  const details: { className: string; added: number }[] = [];

  await db.withTransactionAsync(async () => {
    for (const group of payloads) {
      let classAdded = 0;
      const cls = await db.getFirstAsync<{ grade_level: number; name: string }>(
        'SELECT grade_level, name FROM classes WHERE id = ?',
        group.classId
      );
      const defaultGrade = cls?.grade_level ?? (cls?.name.match(/^(\d{1,2})/)?.[1] ? parseInt(cls.name.match(/^(\d{1,2})/)![1], 10) : undefined);

      for (const s of group.students) {
        if (!s.firstName && !s.studentNumber) continue;
        const studentGrade = s.gradeLevel ?? defaultGrade ?? null;
        await db.runAsync(
          'INSERT INTO students (class_id, student_number, first_name, last_name, notes, grade_level) VALUES (?, ?, ?, ?, ?, ?)',
          group.classId,
          (s.studentNumber || '').trim(),
          (s.firstName || '').trim(),
          (s.lastName || '').trim(),
          (s.notes || '').trim(),
          studentGrade
        );
        classAdded++;
        totalAdded++;
      }
      details.push({ className: group.className, added: classAdded });
    }
  });

  return { totalAdded, details };
};
