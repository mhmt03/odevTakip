import { getDB } from '../db';
import { AgendaItem, AgendaCategory, AgendaPriority } from '../../types';
import { getTodayDateString } from '../../utils/dateUtils';

export interface CreateAgendaItemInput {
  school_id?: number | null;
  title: string;
  description?: string | null;
  date: string; // YYYY-MM-DD
  has_time?: boolean | number;
  time?: string | null;
  is_all_day_alert?: boolean | number;
  category?: AgendaCategory;
  priority?: AgendaPriority;
  is_completed?: boolean | number;
}

export interface AgendaFilterOptions {
  date?: string;
  startDate?: string;
  endDate?: string;
  isCompleted?: boolean;
  category?: AgendaCategory | 'all';
  priority?: AgendaPriority | 'all';
  schoolId?: number | null;
}

export const getAgendaItems = async (options?: AgendaFilterOptions): Promise<AgendaItem[]> => {
  const db = await getDB();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options?.date) {
    conditions.push('date = ?');
    params.push(options.date);
  }

  if (options?.startDate) {
    conditions.push('date >= ?');
    params.push(options.startDate);
  }

  if (options?.endDate) {
    conditions.push('date <= ?');
    params.push(options.endDate);
  }

  if (options?.isCompleted !== undefined) {
    conditions.push('is_completed = ?');
    params.push(options.isCompleted ? 1 : 0);
  }

  if (options?.category && options.category !== 'all') {
    conditions.push('category = ?');
    params.push(options.category);
  }

  if (options?.priority && options.priority !== 'all') {
    conditions.push('priority = ?');
    params.push(options.priority);
  }

  if (options?.schoolId !== undefined && options.schoolId !== null) {
    conditions.push('(school_id = ? OR school_id IS NULL)');
    params.push(options.schoolId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT * FROM agenda_items
    ${whereClause}
    ORDER BY 
      is_completed ASC,
      is_all_day_alert DESC,
      date ASC,
      CASE WHEN has_time = 1 AND time IS NOT NULL THEN time ELSE '99:99' END ASC,
      id DESC
  `;

  return await db.getAllAsync<AgendaItem>(query, ...params);
};

export const getTodayAgendaItems = async (schoolId?: number | null): Promise<AgendaItem[]> => {
  const today = getTodayDateString();
  return await getAgendaItems({ date: today, schoolId });
};

/**
 * Ana ekranda gösterilecek dikkat çekici tüm gün / acil uyarılar:
 * Bugün tarihli, tamamlanmamış ve (is_all_day_alert = 1 VEYA priority = 'acil') olan kayıtlar.
 */
export const getTodayAlertItems = async (schoolId?: number | null): Promise<AgendaItem[]> => {
  const db = await getDB();
  const today = getTodayDateString();
  let where = `WHERE date = ? AND is_completed = 0 AND (is_all_day_alert = 1 OR priority = 'acil')`;
  const params: any[] = [today];

  if (schoolId !== undefined && schoolId !== null) {
    where += ` AND (school_id = ? OR school_id IS NULL)`;
    params.push(schoolId);
  }

  const query = `
    SELECT * FROM agenda_items
    ${where}
    ORDER BY 
      priority = 'acil' DESC,
      is_all_day_alert DESC,
      CASE WHEN has_time = 1 AND time IS NOT NULL THEN time ELSE '99:99' END ASC,
      id DESC
  `;

  return await db.getAllAsync<AgendaItem>(query, ...params);
};

export const getAgendaDaysWithItems = async (
  yearMonth: string,
  schoolId?: number | null
): Promise<{ date: string; count: number; has_alert: boolean }[]> => {
  const db = await getDB();
  let where = `WHERE date LIKE ?`;
  const params: any[] = [`${yearMonth}%`];

  if (schoolId !== undefined && schoolId !== null) {
    where += ` AND (school_id = ? OR school_id IS NULL)`;
    params.push(schoolId);
  }

  const query = `
    SELECT 
      date, 
      COUNT(*) as count, 
      MAX(CASE WHEN is_all_day_alert = 1 AND is_completed = 0 THEN 1 ELSE 0 END) as has_alert
    FROM agenda_items
    ${where}
    GROUP BY date
  `;

  const rows = await db.getAllAsync<{ date: string; count: number; has_alert: number }>(query, ...params);
  return rows.map((r) => ({
    date: r.date,
    count: r.count,
    has_alert: r.has_alert === 1,
  }));
};

export const getAgendaItemById = async (id: number): Promise<AgendaItem | null> => {
  const db = await getDB();
  return await db.getFirstAsync<AgendaItem>('SELECT * FROM agenda_items WHERE id = ?', id);
};

export const createAgendaItem = async (input: CreateAgendaItemInput): Promise<number> => {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO agenda_items (
      school_id, 
      title, 
      description, 
      date, 
      has_time, 
      time, 
      is_all_day_alert, 
      category, 
      priority, 
      is_completed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.school_id ?? null,
    input.title.trim(),
    input.description?.trim() || null,
    input.date,
    input.has_time ? 1 : 0,
    input.has_time && input.time ? input.time : null,
    input.is_all_day_alert ? 1 : 0,
    input.category || 'gorev',
    input.priority || 'normal',
    input.is_completed ? 1 : 0
  );

  return result.lastInsertRowId;
};

export const updateAgendaItem = async (id: number, item: Partial<AgendaItem>): Promise<void> => {
  const db = await getDB();
  const keys: string[] = [];
  const params: any[] = [];

  if (item.title !== undefined) {
    keys.push('title = ?');
    params.push(item.title.trim());
  }
  if (item.description !== undefined) {
    keys.push('description = ?');
    params.push(item.description ? item.description.trim() : null);
  }
  if (item.date !== undefined) {
    keys.push('date = ?');
    params.push(item.date);
  }
  if (item.has_time !== undefined) {
    keys.push('has_time = ?');
    params.push(item.has_time ? 1 : 0);
  }
  if (item.time !== undefined) {
    keys.push('time = ?');
    params.push(item.time || null);
  }
  if (item.is_all_day_alert !== undefined) {
    keys.push('is_all_day_alert = ?');
    params.push(item.is_all_day_alert ? 1 : 0);
  }
  if (item.category !== undefined) {
    keys.push('category = ?');
    params.push(item.category);
  }
  if (item.priority !== undefined) {
    keys.push('priority = ?');
    params.push(item.priority);
  }
  if (item.is_completed !== undefined) {
    keys.push('is_completed = ?');
    params.push(item.is_completed ? 1 : 0);
  }
  if (item.school_id !== undefined) {
    keys.push('school_id = ?');
    params.push(item.school_id);
  }

  if (keys.length === 0) return;

  params.push(id);
  await db.runAsync(`UPDATE agenda_items SET ${keys.join(', ')} WHERE id = ?`, ...params);
};

export const toggleAgendaItemCompleted = async (id: number, isCompleted: boolean): Promise<void> => {
  const db = await getDB();
  await db.runAsync('UPDATE agenda_items SET is_completed = ? WHERE id = ?', isCompleted ? 1 : 0, id);
};

export const deleteAgendaItem = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM agenda_items WHERE id = ?', id);
};

export const getPendingAgendaCountToday = async (schoolId?: number | null): Promise<number> => {
  const db = await getDB();
  const today = getTodayDateString();
  let query = 'SELECT COUNT(*) as count FROM agenda_items WHERE date = ? AND is_completed = 0';
  const params: any[] = [today];

  if (schoolId !== undefined && schoolId !== null) {
    query += ' AND (school_id = ? OR school_id IS NULL)';
    params.push(schoolId);
  }

  const row = await db.getFirstAsync<{ count: number }>(query, ...params);
  return row?.count || 0;
};
