import { getDB } from '../db';
import { ClassItem } from '../../types';

export const getClasses = async (): Promise<ClassItem[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      c.id, 
      c.name, 
      c.description, 
      c.created_at,
      COUNT(s.id) as student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC;
  `;
  return await db.getAllAsync<ClassItem>(query);
};

export const getClassById = async (id: number): Promise<ClassItem | null> => {
  const db = await getDB();
  const query = `
    SELECT 
      c.id, 
      c.name, 
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

export const createClass = async (name: string, description?: string): Promise<number> => {
  const db = await getDB();
  const result = await db.runAsync(
    'INSERT INTO classes (name, description) VALUES (?, ?)',
    name.trim(),
    description?.trim() || ''
  );
  return result.lastInsertRowId;
};

export const updateClass = async (id: number, name: string, description?: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE classes SET name = ?, description = ? WHERE id = ?',
    name.trim(),
    description?.trim() || '',
    id
  );
};

export const deleteClass = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM classes WHERE id = ?', id);
};
