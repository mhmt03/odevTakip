import { getDB } from '../db';
import { CourseName, LessonSlot, ScheduleItem, DaySlotInfo, DaySlotTime } from '../../types';
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

export const clearAllLessonSlots = async (): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM lesson_slots');
};

export const restoreDefaultLessonSlots = async (): Promise<void> => {
  const db = await getDB();
  const starterSlots = [
    { num: 1, name: '1. Ders', start: '08:30', end: '09:10' },
    { num: 2, name: '2. Ders', start: '09:20', end: '10:00' },
    { num: 3, name: '3. Ders', start: '10:10', end: '10:50' },
    { num: 4, name: '4. Ders', start: '11:00', end: '11:40' },
    { num: 5, name: '5. Ders', start: '11:50', end: '12:30' },
    { num: 6, name: '6. Ders', start: '13:15', end: '13:55' },
    { num: 7, name: '7. Ders', start: '14:05', end: '14:45' },
    { num: 8, name: '8. Ders', start: '14:55', end: '15:35' },
  ];
  for (const s of starterSlots) {
    await db.runAsync(
      'INSERT OR IGNORE INTO lesson_slots (slot_number, slot_name, start_time, end_time) VALUES (?, ?, ?, ?)',
      s.num,
      s.name,
      s.start,
      s.end
    );
  }
};

// --- DAY-SPECIFIC LESSON SLOTS (Güne Özel Ders Saatleri) ---
export const getSlotsForDay = async (dayOfWeek: number): Promise<DaySlotInfo[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ls.id,
      ls.slot_number,
      ls.slot_name,
      COALESCE(dst.start_time, ls.start_time) as start_time,
      COALESCE(dst.end_time, ls.end_time) as end_time,
      CASE WHEN dst.id IS NOT NULL THEN 1 ELSE 0 END as is_custom_time
    FROM lesson_slots ls
    LEFT JOIN day_slot_times dst ON dst.slot_id = ls.id AND dst.day_of_week = ?
    ORDER BY ls.slot_number ASC
  `;
  const rows = await db.getAllAsync<any>(query, dayOfWeek);
  return rows.map((r) => ({
    id: r.id,
    slot_number: r.slot_number,
    slot_name: r.slot_name,
    start_time: r.start_time,
    end_time: r.end_time,
    is_custom_time: Boolean(r.is_custom_time),
  }));
};

export const getCustomDaysWithOverrides = async (): Promise<number[]> => {
  const db = await getDB();
  const rows = await db.getAllAsync<{ day_of_week: number }>(
    'SELECT DISTINCT day_of_week FROM day_slot_times'
  );
  return rows.map((r) => r.day_of_week);
};

export const saveDaySlotTime = async (
  dayOfWeek: number,
  slotId: number,
  startTime: string,
  endTime: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO day_slot_times (day_of_week, slot_id, start_time, end_time)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(day_of_week, slot_id) DO UPDATE SET
       start_time = excluded.start_time,
       end_time = excluded.end_time`,
    dayOfWeek,
    slotId,
    startTime.trim(),
    endTime.trim()
  );
};

export const copyStandardSlotsToDay = async (dayOfWeek: number): Promise<void> => {
  const db = await getDB();
  const slots = await getLessonSlots();
  for (const s of slots) {
    await db.runAsync(
      `INSERT INTO day_slot_times (day_of_week, slot_id, start_time, end_time)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(day_of_week, slot_id) DO UPDATE SET
         start_time = excluded.start_time,
         end_time = excluded.end_time`,
      dayOfWeek,
      s.id,
      s.start_time,
      s.end_time
    );
  }
};

export const resetDaySlotTimes = async (dayOfWeek: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM day_slot_times WHERE day_of_week = ?', dayOfWeek);
};

// --- WEEKLY SCHEDULE (Haftalık Ders Programı) ---
export const getWeeklySchedule = async (): Promise<ScheduleItem[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ls.id as slot_id,
      ls.slot_number,
      ls.slot_name,
      COALESCE(dst.start_time, ls.start_time) as start_time,
      COALESCE(dst.end_time, ls.end_time) as end_time,
      CASE WHEN dst.id IS NOT NULL THEN 1 ELSE 0 END as is_custom_time,
      s.id,
      days.day_of_week,
      s.class_id,
      c.name as class_name,
      s.course_id,
      cr.name as course_name,
      cr.code as course_code,
      cr.color as course_color,
      s.classroom
    FROM lesson_slots ls
    CROSS JOIN (
      SELECT 1 as day_of_week UNION SELECT 2 UNION SELECT 3 
      UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
    ) days
    LEFT JOIN day_slot_times dst ON dst.slot_id = ls.id AND dst.day_of_week = days.day_of_week
    LEFT JOIN schedules s ON s.slot_id = ls.id AND s.day_of_week = days.day_of_week
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN courses cr ON cr.id = s.course_id
    ORDER BY days.day_of_week ASC, ls.slot_number ASC;
  `;
  const rows = await db.getAllAsync<any>(query);
  return rows.map((r) => ({
    ...r,
    is_custom_time: Boolean(r.is_custom_time),
  }));
};

export const getScheduleByDay = async (dayOfWeek: number): Promise<ScheduleItem[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ls.id as slot_id,
      ls.slot_number,
      ls.slot_name,
      COALESCE(dst.start_time, ls.start_time) as start_time,
      COALESCE(dst.end_time, ls.end_time) as end_time,
      CASE WHEN dst.id IS NOT NULL THEN 1 ELSE 0 END as is_custom_time,
      s.id,
      ? as day_of_week,
      s.class_id,
      c.name as class_name,
      s.course_id,
      cr.name as course_name,
      cr.code as course_code,
      cr.color as course_color,
      s.classroom
    FROM lesson_slots ls
    LEFT JOIN day_slot_times dst ON dst.slot_id = ls.id AND dst.day_of_week = ?
    LEFT JOIN schedules s ON s.slot_id = ls.id AND s.day_of_week = ?
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN courses cr ON cr.id = s.course_id
    ORDER BY ls.slot_number ASC;
  `;
  const rows = await db.getAllAsync<any>(query, dayOfWeek, dayOfWeek, dayOfWeek);
  return rows.map((r) => ({
    ...r,
    is_custom_time: Boolean(r.is_custom_time),
  }));
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

export const clearEntireSchedule = async (resetDayOverrides: boolean = false): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM schedules');
  if (resetDayOverrides) {
    await db.runAsync('DELETE FROM day_slot_times');
  }
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

export interface LoadScheduleResult {
  success: boolean;
  totalLessonsLoaded: number;
  classesEnsured: string[];
  coursesEnsured: Array<{ name: string; code: string }>;
  slotsCount: number;
  message: string;
}

/**
 * Kamil Miras Anadolu Lisesi (Mehmet Gündöner) resmi haftalık ders programını (27 Saat)
 * otomatik olarak veritabanına yükler.
 * 
 * ÖNEMLİ KURAL: Kullanıcının tanımladığı veya değiştirdiği ders saatleri (başlangıç/bitiş zamanları)
 * kesinlikle silinmez veya ezilmez. Sadece slot numaralarına (1..8) göre ders atamaları yapılır.
 */
export const loadOfficialWeeklySchedule = async (): Promise<LoadScheduleResult> => {
  const db = await getDB();

  // 1. DERSLERİ HAZIRLA: S.FZK ve HDTE2
  let courseIdFzk: number;
  const existingFzkByCode = await db.getFirstAsync<{ id: number; name: string }>(
    "SELECT id, name FROM courses WHERE UPPER(TRIM(code)) = 'S.FZK'"
  );
  if (existingFzkByCode) {
    courseIdFzk = existingFzkByCode.id;
  } else {
    const existingFzkByName = await db.getFirstAsync<{ id: number; name: string }>(
      "SELECT id, name FROM courses WHERE UPPER(name) LIKE '%FİZİK%' OR UPPER(name) LIKE '%FIZIK%'"
    );
    if (existingFzkByName) {
      await db.runAsync("UPDATE courses SET code = 'S.FZK' WHERE id = ?", existingFzkByName.id);
      courseIdFzk = existingFzkByName.id;
    } else {
      const res = await db.runAsync(
        "INSERT INTO courses (name, code, color) VALUES (?, ?, ?)",
        'Seçmeli Fizik',
        'S.FZK',
        '#4F46E5'
      );
      courseIdFzk = res.lastInsertRowId;
    }
  }

  let courseIdHdte: number;
  const existingHdteByCode = await db.getFirstAsync<{ id: number; name: string }>(
    "SELECT id, name FROM courses WHERE UPPER(TRIM(code)) = 'HDTE2'"
  );
  if (existingHdteByCode) {
    courseIdHdte = existingHdteByCode.id;
  } else {
    const existingHdteByName = await db.getFirstAsync<{ id: number; name: string }>(
      "SELECT id, name FROM courses WHERE UPPER(name) LIKE '%DESTEK%' OR UPPER(name) LIKE '%HDTE%'"
    );
    if (existingHdteByName) {
      await db.runAsync("UPDATE courses SET code = 'HDTE2' WHERE id = ?", existingHdteByName.id);
      courseIdHdte = existingHdteByName.id;
    } else {
      const res = await db.runAsync(
        "INSERT INTO courses (name, code, color) VALUES (?, ?, ?)",
        'Hedef Temelli Destek Eğitimi 2',
        'HDTE2',
        '#0EA5E9'
      );
      courseIdHdte = res.lastInsertRowId;
    }
  }

  // 2. ŞUBELERİ HAZIRLA: 11-A, 11-B, 11-C, 12-C, 12-D, 12-E
  const targetClasses = [
    { norm: '11A', defaultName: '11-A' },
    { norm: '11B', defaultName: '11-B' },
    { norm: '11C', defaultName: '11-C' },
    { norm: '12C', defaultName: '12-C' },
    { norm: '12D', defaultName: '12-D' },
    { norm: '12E', defaultName: '12-E' },
  ];

  const existingClasses = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM classes');
  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const classMap: Record<string, number> = {};
  const ensuredClassNames: string[] = [];

  for (const target of targetClasses) {
    const match = existingClasses.find((c) => normalize(c.name) === target.norm);
    if (match) {
      classMap[target.norm] = match.id;
      ensuredClassNames.push(match.name);
    } else {
      const res = await db.runAsync(
        'INSERT INTO classes (name, description) VALUES (?, ?)',
        target.defaultName,
        'Kamil Miras AL'
      );
      classMap[target.norm] = res.lastInsertRowId;
      ensuredClassNames.push(target.defaultName);
    }
  }

  // 3. DERS SAATLERİ: 1..8 (KULLANICININ ÖZEL SAATLERİ KORUNUR)
  const existingSlots = await db.getAllAsync<{ id: number; slot_number: number }>(
    'SELECT id, slot_number FROM lesson_slots ORDER BY slot_number ASC'
  );
  const slotMap: Record<number, number> = {};
  for (const s of existingSlots) {
    slotMap[s.slot_number] = s.id;
  }

  const defaultStarterTimes: Record<number, { name: string; start: string; end: string }> = {
    1: { name: '1. Ders', start: '08:30', end: '09:10' },
    2: { name: '2. Ders', start: '09:25', end: '10:05' },
    3: { name: '3. Ders', start: '10:15', end: '10:55' },
    4: { name: '4. Ders', start: '11:05', end: '11:45' },
    5: { name: '5. Ders', start: '11:55', end: '12:35' },
    6: { name: '6. Ders', start: '13:40', end: '14:20' },
    7: { name: '7. Ders', start: '14:30', end: '15:10' },
    8: { name: '8. Ders', start: '15:20', end: '16:00' },
  };

  for (let slotNum = 1; slotNum <= 8; slotNum++) {
    if (!slotMap[slotNum]) {
      const t = defaultStarterTimes[slotNum] || { name: `${slotNum}. Ders`, start: '08:30', end: '09:10' };
      const res = await db.runAsync(
        'INSERT INTO lesson_slots (slot_number, slot_name, start_time, end_time) VALUES (?, ?, ?, ?)',
        slotNum,
        t.name,
        t.start,
        t.end
      );
      slotMap[slotNum] = res.lastInsertRowId;
    }
  }

  // 4. HAFTA İÇİ (Pzt - Cuma) 1..8 SAATLERİNDEKİ ESKİ PROGRAMI TEMİZLE
  for (let day = 1; day <= 5; day++) {
    for (let slotNum = 1; slotNum <= 8; slotNum++) {
      const slotId = slotMap[slotNum];
      if (slotId) {
        await db.runAsync('DELETE FROM schedules WHERE day_of_week = ? AND slot_id = ?', day, slotId);
      }
    }
  }

  // 5. RESİMDEKİ 27 SAATLİK RESMİ DAĞILIM
  const officialScheduleGrid: Array<{
    day: number;
    slotNum: number;
    classNorm: string;
    courseCode: 'S.FZK' | 'HDTE2';
  }> = [
    // Pazartesi (Day 1) - 6 saat
    { day: 1, slotNum: 1, classNorm: '12D', courseCode: 'HDTE2' },
    { day: 1, slotNum: 2, classNorm: '12D', courseCode: 'S.FZK' },
    { day: 1, slotNum: 3, classNorm: '12D', courseCode: 'S.FZK' },
    { day: 1, slotNum: 4, classNorm: '12C', courseCode: 'HDTE2' },
    { day: 1, slotNum: 5, classNorm: '11C', courseCode: 'S.FZK' },
    { day: 1, slotNum: 6, classNorm: '11C', courseCode: 'S.FZK' },

    // Salı (Day 2) - 8 saat
    { day: 2, slotNum: 1, classNorm: '11B', courseCode: 'S.FZK' },
    { day: 2, slotNum: 2, classNorm: '11B', courseCode: 'S.FZK' },
    { day: 2, slotNum: 3, classNorm: '12E', courseCode: 'S.FZK' },
    { day: 2, slotNum: 4, classNorm: '12E', courseCode: 'S.FZK' },
    { day: 2, slotNum: 5, classNorm: '12C', courseCode: 'S.FZK' },
    { day: 2, slotNum: 6, classNorm: '12C', courseCode: 'S.FZK' },
    { day: 2, slotNum: 7, classNorm: '12D', courseCode: 'S.FZK' },
    { day: 2, slotNum: 8, classNorm: '12D', courseCode: 'S.FZK' },

    // Çarşamba (Day 3) - 5 saat
    { day: 3, slotNum: 1, classNorm: '11C', courseCode: 'S.FZK' },
    { day: 3, slotNum: 2, classNorm: '11C', courseCode: 'S.FZK' },
    { day: 3, slotNum: 3, classNorm: '11A', courseCode: 'S.FZK' },
    { day: 3, slotNum: 4, classNorm: '11A', courseCode: 'S.FZK' },
    { day: 3, slotNum: 5, classNorm: '12E', courseCode: 'HDTE2' },

    // Perşembe (Day 4) - 6 saat
    { day: 4, slotNum: 1, classNorm: '11A', courseCode: 'S.FZK' },
    { day: 4, slotNum: 2, classNorm: '11A', courseCode: 'S.FZK' },
    { day: 4, slotNum: 3, classNorm: '12E', courseCode: 'S.FZK' },
    { day: 4, slotNum: 4, classNorm: '12E', courseCode: 'S.FZK' },
    { day: 4, slotNum: 5, classNorm: '11B', courseCode: 'S.FZK' },
    { day: 4, slotNum: 6, classNorm: '11B', courseCode: 'S.FZK' },

    // Cuma (Day 5) - 2 saat
    { day: 5, slotNum: 1, classNorm: '12C', courseCode: 'S.FZK' },
    { day: 5, slotNum: 2, classNorm: '12C', courseCode: 'S.FZK' },
  ];

  for (const item of officialScheduleGrid) {
    const slotId = slotMap[item.slotNum];
    const classId = classMap[item.classNorm];
    const courseId = item.courseCode === 'HDTE2' ? courseIdHdte : courseIdFzk;

    await db.runAsync(
      `INSERT INTO schedules (day_of_week, slot_id, class_id, course_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(day_of_week, slot_id) DO UPDATE SET
         class_id = excluded.class_id,
         course_id = excluded.course_id`,
      item.day,
      slotId,
      classId,
      courseId
    );
  }

  return {
    success: true,
    totalLessonsLoaded: officialScheduleGrid.length,
    classesEnsured: ensuredClassNames,
    coursesEnsured: [
      { name: 'Seçmeli Fizik', code: 'S.FZK' },
      { name: 'Hedef Temelli Destek Eğitimi 2', code: 'HDTE2' },
    ],
    slotsCount: Object.keys(slotMap).length,
    message: '27 saatlik resmi okul ders programı başarıyla yüklendi. Ders saatleriniz korundu.',
  };
};
