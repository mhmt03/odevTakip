import { getDB } from '../db';
import { CourseName, LessonSlot, ScheduleItem } from '../../types';
import { getDayOfWeekIndex, getCurrentTimeString, isTimeBetween } from '../../utils/dateUtils';

// --- COURSES (Ders Adları) ---
export const getCourses = async (): Promise<CourseName[]> => {
  const db = await getDB();
  return await db.getAllAsync<CourseName>('SELECT * FROM courses ORDER BY name ASC');
};

export const createCourse = async (name: string, code?: string, color?: string): Promise<number> => {
  const db = await getDB();
  const res = await db.runAsync(
    'INSERT INTO courses (name, code, color) VALUES (?, ?, ?)',
    name.trim(),
    code?.trim() || '',
    color || '#4F46E5'
  );
  return res.lastInsertRowId;
};

export const updateCourse = async (id: number, name: string, code?: string, color?: string): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE courses SET name = ?, code = ?, color = ? WHERE id = ?',
    name.trim(),
    code?.trim() || '',
    color || '#4F46E5',
    id
  );
};

export const deleteCourse = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM courses WHERE id = ?', id);
};

// --- LESSON SLOTS (Ders Saatleri) ---
export const getLessonSlots = async (): Promise<LessonSlot[]> => {
  const db = await getDB();
  return await db.getAllAsync<LessonSlot>('SELECT * FROM lesson_slots ORDER BY slot_number ASC');
};

export const createLessonSlot = async (
  slotNumber: number,
  slotName: string,
  startTime: string,
  endTime: string
): Promise<number> => {
  const db = await getDB();
  const res = await db.runAsync(
    'INSERT INTO lesson_slots (slot_number, slot_name, start_time, end_time) VALUES (?, ?, ?, ?)',
    slotNumber,
    slotName.trim(),
    startTime.trim(),
    endTime.trim()
  );
  return res.lastInsertRowId;
};

export const updateLessonSlot = async (
  id: number,
  slotNumber: number,
  slotName: string,
  startTime: string,
  endTime: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'UPDATE lesson_slots SET slot_number = ?, slot_name = ?, start_time = ?, end_time = ? WHERE id = ?',
    slotNumber,
    slotName.trim(),
    startTime.trim(),
    endTime.trim(),
    id
  );
};

export const deleteLessonSlot = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM lesson_slots WHERE id = ?', id);
};

// --- WEEKLY SCHEDULE (Haftalık Ders Programı) ---
export const getWeeklySchedule = async (): Promise<ScheduleItem[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ls.id as slot_id,
      ls.slot_number,
      ls.slot_name,
      ls.start_time,
      ls.end_time,
      s.id,
      s.day_of_week,
      s.class_id,
      c.name as class_name,
      s.course_id,
      cr.name as course_name,
      s.classroom
    FROM lesson_slots ls
    CROSS JOIN (
      SELECT 1 as day_of_week UNION SELECT 2 UNION SELECT 3 
      UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
    ) days
    LEFT JOIN schedules s ON s.slot_id = ls.id AND s.day_of_week = days.day_of_week
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN courses cr ON cr.id = s.course_id
    ORDER BY days.day_of_week ASC, ls.slot_number ASC;
  `;
  return await db.getAllAsync<ScheduleItem>(query);
};

export const getScheduleByDay = async (dayOfWeek: number): Promise<ScheduleItem[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ls.id as slot_id,
      ls.slot_number,
      ls.slot_name,
      ls.start_time,
      ls.end_time,
      s.id,
      ? as day_of_week,
      s.class_id,
      c.name as class_name,
      s.course_id,
      cr.name as course_name,
      s.classroom
    FROM lesson_slots ls
    LEFT JOIN schedules s ON s.slot_id = ls.id AND s.day_of_week = ?
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN courses cr ON cr.id = s.course_id
    ORDER BY ls.slot_number ASC;
  `;
  return await db.getAllAsync<ScheduleItem>(query, dayOfWeek, dayOfWeek);
};

export const saveScheduleSlot = async (
  dayOfWeek: number,
  slotId: number,
  classId: number | null,
  courseId: number | null,
  classroom?: string
): Promise<void> => {
  const db = await getDB();
  if (!classId && !courseId) {
    // If both empty, delete slot assignment
    await db.runAsync(
      'DELETE FROM schedules WHERE day_of_week = ? AND slot_id = ?',
      dayOfWeek,
      slotId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO schedules (day_of_week, slot_id, class_id, course_id, classroom)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day_of_week, slot_id) DO UPDATE SET
       class_id = excluded.class_id,
       course_id = excluded.course_id,
       classroom = excluded.classroom`,
    dayOfWeek,
    slotId,
    classId,
    courseId,
    classroom?.trim() || null
  );
};

export interface ActiveLessonInfo {
  currentLesson: ScheduleItem | null;
  nextLesson: ScheduleItem | null;
  todayLessons: ScheduleItem[];
}

export const getActiveAndTodayLessons = async (): Promise<ActiveLessonInfo> => {
  const dayOfWeek = getDayOfWeekIndex();
  const todayLessonsAll = await getScheduleByDay(dayOfWeek);
  const currentTime = getCurrentTimeString();

  // Filter only slots that actually have a class or course assigned
  const assignedLessons = todayLessonsAll.filter((item) => item.class_id || item.course_id);

  let currentLesson: ScheduleItem | null = null;
  let nextLesson: ScheduleItem | null = null;

  for (const item of assignedLessons) {
    if (item.start_time && item.end_time) {
      if (isTimeBetween(currentTime, item.start_time, item.end_time)) {
        currentLesson = item;
      } else if (!nextLesson && item.start_time > currentTime) {
        nextLesson = item;
      }
    }
  }

  return {
    currentLesson,
    nextLesson,
    todayLessons: assignedLessons,
  };
};
