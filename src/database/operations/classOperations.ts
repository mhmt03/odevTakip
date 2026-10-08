import { getDB } from '../db';
import { ClassItem } from '../../types';

export const getClasses = async (): Promise<ClassItem[]> => {
  const db = await getDB();
  const activeSchool = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE is_active = 1 LIMIT 1');
  const schoolId = activeSchool?.id || 1;

  const query = `
    SELECT 
      c.id,
      c.school_id,
      c.name, 
      c.grade_level,
      c.description, 
      c.created_at,
      COUNT(s.id) as student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    WHERE c.school_id = ? OR c.school_id IS NULL
    GROUP BY c.id
    ORDER BY c.name ASC;
  `;
  return await db.getAllAsync<ClassItem>(query, schoolId);
};

export const getClassById = async (id: number): Promise<ClassItem | null> => {
  const db = await getDB();
  const query = `
    SELECT 
      c.id, 
      c.school_id,
      c.name, 
      c.grade_level,
      c.description, 
      c.created_at,
      COUNT(s.id) as student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    WHERE c.id = ?
    GROUP BY c.id;
  `;
  return await db.getFirstAsync<ClassItem>(query, id);
};

export const createClass = async (
  name: string,
  description?: string,
  gradeLevel?: number
): Promise<number> => {
  const db = await getDB();
  const activeSchool = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE is_active = 1 LIMIT 1');
  const schoolId = activeSchool?.id || 1;

  let calculatedGradeLevel = gradeLevel;
  if (calculatedGradeLevel === undefined) {
    const match = name.trim().match(/^(\d{1,2})/);
    if (match) {
      calculatedGradeLevel = parseInt(match[1], 10);
    }
  }

  const result = await db.runAsync(
    'INSERT INTO classes (school_id, name, description, grade_level) VALUES (?, ?, ?, ?)',
    schoolId,
    name.trim(),
    description?.trim() || '',
    calculatedGradeLevel ?? null
  );
  return result.lastInsertRowId;
};

export const updateClass = async (
  id: number,
  name: string,
  description?: string,
  gradeLevel?: number
): Promise<void> => {
  const db = await getDB();

  let calculatedGradeLevel = gradeLevel;
  if (calculatedGradeLevel === undefined) {
    const match = name.trim().match(/^(\d{1,2})/);
    if (match) {
      calculatedGradeLevel = parseInt(match[1], 10);
    }
  }

  await db.runAsync(
    'UPDATE classes SET name = ?, description = ?, grade_level = ? WHERE id = ?',
    name.trim(),
    description?.trim() || '',
    calculatedGradeLevel ?? null,
    id
  );
};

export const deleteClass = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM classes WHERE id = ?', id);
};
