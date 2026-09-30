import { getDB } from '../db';

export interface School {
  id: number;
  name: string;
  code?: string;
  color: string;
  is_active: number; // 1 = aktif okul, 0 = pasif
  created_at?: string;
}

export const SCHOOL_COLORS = [
  { name: 'Soft İndigo', color: '#6366F1' },
  { name: 'Gökyüzü Mavi', color: '#38BDF8' },
  { name: 'Tatlı Zümrüt', color: '#34D399' },
  { name: 'Sıcak Amber', color: '#FBBF24' },
  { name: 'Gül Pembe', color: '#F472B6' },
  { name: 'Yumuşak Mor', color: '#A78BFA' },
  { name: 'Fas Turkuazı', color: '#2DD4BF' },
  { name: 'Mercan Kırmızı', color: '#F87171' },
];

export const getSchools = async (): Promise<School[]> => {
  const db = await getDB();
  return await db.getAllAsync<School>('SELECT * FROM schools ORDER BY id ASC');
};

export const getActiveSchool = async (): Promise<School | null> => {
  const db = await getDB();
  const school = await db.getFirstAsync<School>('SELECT * FROM schools WHERE is_active = 1 LIMIT 1');
  if (school) return school;

  // Fallback: Return first school if none active
  const firstSchool = await db.getFirstAsync<School>('SELECT * FROM schools ORDER BY id ASC LIMIT 1');
  if (firstSchool) {
    await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstSchool.id);
    return { ...firstSchool, is_active: 1 };
  }
  return null;
};

export const setActiveSchool = async (schoolId: number): Promise<School | null> => {
  const db = await getDB();
  await db.runAsync('UPDATE schools SET is_active = 0');
  await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', schoolId);
  return await getActiveSchool();
};

export const createSchool = async (name: string, color: string, code?: string): Promise<number> => {
  const db = await getDB();
  
  // Pasifleştir ve yeniyi aktif olarak ekle
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM schools');
  const isFirst = !countRow || countRow.count === 0;

  if (isFirst) {
    const result = await db.runAsync(
      'INSERT INTO schools (name, color, code, is_active) VALUES (?, ?, ?, 1)',
      name.trim(),
      color,
      code?.trim() || ''
    );
    return result.lastInsertRowId;
  } else {
    // Yeni eklenen okulu doğrudan aktif yapalım ki kullanıcı o okula geçsin
    await db.runAsync('UPDATE schools SET is_active = 0');
    const result = await db.runAsync(
      'INSERT INTO schools (name, color, code, is_active) VALUES (?, ?, ?, 1)',
      name.trim(),
      color,
      code?.trim() || ''
    );
    return result.lastInsertRowId;
  }
};

export const updateSchool = async (id: number, name: string, color: string, code?: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE schools SET name = ?, color = ?, code = ? WHERE id = ?',
    name.trim(),
    color,
    code?.trim() || '',
    id
  );
};

export const deleteSchool = async (id: number): Promise<void> => {
  const db = await getDB();
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM schools');
  if (countRow && countRow.count <= 1) {
    throw new Error('En az bir okul bulunmalıdır, son okul silinemez.');
  }

  const target = await db.getFirstAsync<School>('SELECT * FROM schools WHERE id = ?', id);
  await db.runAsync('DELETE FROM schools WHERE id = ?', id);

  if (target?.is_active) {
    const firstRemaining = await db.getFirstAsync<School>('SELECT * FROM schools ORDER BY id ASC LIMIT 1');
    if (firstRemaining) {
      await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstRemaining.id);
    }
  }
};
