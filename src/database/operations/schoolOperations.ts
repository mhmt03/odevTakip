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

// --- VARSAYILAN OKUL ---
export const getDefaultSchoolId = async (): Promise<number | null> => {
  const db = await getDB();
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'default_school_id'"
    );
    if (!row?.value) return null;
    const id = parseInt(row.value, 10);
    if (isNaN(id)) return null;
    const exists = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE id = ?', id);
    return exists ? id : null;
  } catch (e) {
    console.warn('Error reading default school id:', e);
    return null;
  }
};

export const setDefaultSchoolId = async (schoolId: number | null): Promise<void> => {
  const db = await getDB();
  if (schoolId === null) {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'default_school_id'");
    return;
  }
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES ('default_school_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(schoolId)
  );
};

/**
 * Uygulama açılışında çağrılır: varsayılan okul tanımlıysa onu aktif okul yapar.
 */
export const activateDefaultSchoolOnStartup = async (): Promise<School | null> => {
  const defaultId = await getDefaultSchoolId();
  if (defaultId !== null) {
    return await setActiveSchool(defaultId);
  }
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

  const defaultId = await getDefaultSchoolId();
  if (defaultId === null || defaultId === id) {
    await db.runAsync("DELETE FROM app_settings WHERE key = 'default_school_id'");
  }

  if (target?.is_active) {
    const firstRemaining = await db.getFirstAsync<School>('SELECT * FROM schools ORDER BY id ASC LIMIT 1');
    if (firstRemaining) {
      await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstRemaining.id);
    }
  }
};
