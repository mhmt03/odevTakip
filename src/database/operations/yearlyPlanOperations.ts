import { getDB } from '../db';
import { YearlyPlanItem } from '../../types';
import { getTodayDateString, DAYS_OF_WEEK } from '../../utils/dateUtils';

export interface CourseGradeScheduleInfo {
  hasSchedule: boolean;
  totalWeeklyHours: number;
  classes: Array<{ classId: number; className: string; hours: number }>;
  distinctClasses: string[];
  daysSummary: string;
}

/**
 * Ders programında belirli bir ders ve sınıf düzeyine ait ders saatlerini ve şubeleri tespit eder.
 */
export const getScheduleInfoForCourseAndGrade = async (
  courseId: number,
  gradeLevel: number
): Promise<CourseGradeScheduleInfo> => {
  const db = await getDB();

  // Tüm şubeleri ve program eşleşmelerini çek
  const query = `
    SELECT 
      s.day_of_week,
      s.slot_id,
      s.class_id,
      c.name as class_name
    FROM schedules s
    JOIN classes c ON c.id = s.class_id
    WHERE s.course_id = ?
    ORDER BY s.day_of_week ASC, s.slot_id ASC;
  `;
  const rows = await db.getAllAsync<{
    day_of_week: number;
    slot_id: number;
    class_id: number;
    class_name: string;
  }>(query, courseId);

  // Sınıf düzeyine göre filtrele (örneğin "11-A" veya "11/A" -> grade 11)
  const matchedRows = rows.filter((r) => {
    const numMatch = r.class_name.match(/\d+/);
    if (!numMatch) return false;
    return parseInt(numMatch[0], 10) === gradeLevel;
  });

  if (matchedRows.length === 0) {
    return {
      hasSchedule: false,
      totalWeeklyHours: 0,
      classes: [],
      distinctClasses: [],
      daysSummary: 'Ders programında bu sınıf düzeyine ait ders bulunamadı.',
    };
  }

  // Şube bazında saatleri say
  const classHoursMap: Record<number, { classId: number; className: string; hours: number }> = {};
  const dayCounts: Record<number, number> = {};

  for (const r of matchedRows) {
    if (!classHoursMap[r.class_id]) {
      classHoursMap[r.class_id] = { classId: r.class_id, className: r.class_name, hours: 0 };
    }
    classHoursMap[r.class_id].hours += 1;

    dayCounts[r.day_of_week] = (dayCounts[r.day_of_week] || 0) + 1;
  }

  const classesList = Object.values(classHoursMap);
  const distinctClasses = classesList.map((c) => c.className);

  // Bir şubenin haftalık ortalama saati (genellikle her şubede aynıdır, örn: 4 saat)
  const branchHours = classesList.length > 0 ? Math.round(matchedRows.length / classesList.length) : 0;

  // Günler özeti: "Çarşamba (2 saat), Perşembe (2 saat)"
  const daySummaryParts: string[] = [];
  for (let day = 1; day <= 7; day++) {
    if (dayCounts[day]) {
      const dayName = DAYS_OF_WEEK.find((d) => d.id === day)?.name || `${day}. Gün`;
      daySummaryParts.push(`${dayName} (${dayCounts[day]} saat)`);
    }
  }

  return {
    hasSchedule: true,
    totalWeeklyHours: branchHours, // O sınıf düzeyindeki tek bir şubenin haftalık ders yükü
    classes: classesList,
    distinctClasses,
    daysSummary: daySummaryParts.join(', '),
  };
};

export const getYearlyPlans = async (
  courseId?: number,
  gradeLevel?: number,
  classId?: number
): Promise<YearlyPlanItem[]> => {
  const db = await getDB();
  const conditions: string[] = [];
  const params: any[] = [];

  if (courseId) {
    conditions.push('yp.course_id = ?');
    params.push(courseId);
  }
  if (gradeLevel) {
    conditions.push('yp.grade_level = ?');
    params.push(gradeLevel);
  }
  if (classId) {
    conditions.push('yp.class_id = ?');
    params.push(classId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      yp.id,
      yp.course_id,
      cr.name as course_name,
      cr.code as course_code,
      yp.class_id,
      c.name as class_name,
      yp.grade_level,
      yp.lesson_hours,
      yp.week_number,
      yp.date_start,
      yp.date_end,
      yp.subject_topic,
      yp.learning_outcomes
    FROM yearly_plans yp
    LEFT JOIN courses cr ON cr.id = yp.course_id
    LEFT JOIN classes c ON c.id = yp.class_id
    ${whereClause}
    ORDER BY yp.week_number ASC, yp.id ASC;
  `;
  return await db.getAllAsync<YearlyPlanItem>(query, ...params);
};

export const createYearlyPlan = async (
  courseId: number,
  weekNumber: number,
  subjectTopic: string,
  classId?: number | null,
  dateStart?: string,
  dateEnd?: string,
  learningOutcomes?: string,
  gradeLevel?: number | null,
  lessonHours?: number
): Promise<number> => {
  const db = await getDB();
  const res = await db.runAsync(
    `INSERT INTO yearly_plans 
     (course_id, class_id, grade_level, lesson_hours, week_number, subject_topic, date_start, date_end, learning_outcomes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    courseId,
    classId || null,
    gradeLevel || null,
    lessonHours || 0,
    weekNumber,
    subjectTopic.trim(),
    dateStart || null,
    dateEnd || null,
    learningOutcomes?.trim() || null
  );
  return res.lastInsertRowId;
};

export const updateYearlyPlan = async (
  id: number,
  courseId: number,
  weekNumber: number,
  subjectTopic: string,
  classId?: number | null,
  dateStart?: string,
  dateEnd?: string,
  learningOutcomes?: string,
  gradeLevel?: number | null,
  lessonHours?: number
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `UPDATE yearly_plans 
     SET course_id = ?, class_id = ?, grade_level = ?, lesson_hours = ?, 
         week_number = ?, subject_topic = ?, date_start = ?, date_end = ?, 
         learning_outcomes = ?
     WHERE id = ?`,
    courseId,
    classId || null,
    gradeLevel || null,
    lessonHours || 0,
    weekNumber,
    subjectTopic.trim(),
    dateStart || null,
    dateEnd || null,
    learningOutcomes?.trim() || null,
    id
  );
};

export const deleteYearlyPlan = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM yearly_plans WHERE id = ?', id);
};

export const deleteYearlyPlansByCourseAndGrade = async (
  courseId: number,
  gradeLevel: number
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'DELETE FROM yearly_plans WHERE course_id = ? AND grade_level = ?',
    courseId,
    gradeLevel
  );
};

export interface BulkPlanItemPayload {
  weekNumber: number;
  dateStart?: string;
  dateEnd?: string;
  lessonHours?: number;
  subjectTopic: string;
  learningOutcomes?: string;
  classId?: number | null;
}

/**
 * Belirli bir ders ve sınıf düzeyi için Excel'den gelen yıllık plan listesini topluca kaydeder.
 */
export const bulkCreateYearlyPlanItems = async (
  courseId: number,
  gradeLevel: number,
  items: BulkPlanItemPayload[],
  replaceExisting: boolean = true
): Promise<{ insertedCount: number }> => {
  const db = await getDB();

  if (replaceExisting) {
    await deleteYearlyPlansByCourseAndGrade(courseId, gradeLevel);
  }

  let count = 0;
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO yearly_plans 
       (course_id, class_id, grade_level, lesson_hours, week_number, subject_topic, date_start, date_end, learning_outcomes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      courseId,
      item.classId || null,
      gradeLevel,
      item.lessonHours || 0,
      item.weekNumber,
      item.subjectTopic.trim(),
      item.dateStart || null,
      item.dateEnd || null,
      item.learningOutcomes?.trim() || null
    );
    count++;
  }

  return { insertedCount: count };
};

/**
 * Dersteki aktif sınıf ve derse göre deftere yazılacak güncel konuyu tespit eder.
 * Sınıf düzeyine (`grade_level`) göre otomatik eşleştirme yapar.
 * Bir haftada birden fazla alt konu varsa (Örn: Kuvvet 2 saat, Hareket 2 saat),
 * dersin haftalık kaçıncı saat olduğuna bakarak o saate denk gelen konuyu gösterir.
 */
export const getCurrentTopicForClass = async (
  classId: number,
  courseId?: number,
  dayOfWeek?: number,
  slotId?: number
): Promise<YearlyPlanItem | null> => {
  const db = await getDB();
  const today = getTodayDateString();

  // Şube adını alıp sınıf düzeyini çıkar (Örn: "11-A" -> 11)
  const classRow = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM classes WHERE id = ?',
    classId
  );
  let gradeLevel: number | null = null;
  if (classRow) {
    const m = classRow.name.match(/\d+/);
    if (m) gradeLevel = parseInt(m[0], 10);
  }

  // O haftaya denk gelen tüm plan satırlarını çek (aynı haftada birden fazla alt konu olabilir: Kuvvet 2 saat, Hareket 2 saat)
  let query = `
    SELECT 
      yp.id,
      yp.course_id,
      cr.name as course_name,
      cr.code as course_code,
      yp.class_id,
      c.name as class_name,
      yp.grade_level,
      yp.lesson_hours,
      yp.week_number,
      yp.date_start,
      yp.date_end,
      yp.subject_topic,
      yp.learning_outcomes
    FROM yearly_plans yp
    LEFT JOIN courses cr ON cr.id = yp.course_id
    LEFT JOIN classes c ON c.id = yp.class_id
    WHERE (
      yp.class_id = ? 
      OR (yp.class_id IS NULL AND (yp.grade_level = ? OR (yp.grade_level IS NULL AND ? IS NULL)))
    )
    ${courseId ? 'AND yp.course_id = ?' : ''}
    AND yp.date_start <= ? AND yp.date_end >= ?
    ORDER BY yp.class_id DESC, yp.grade_level DESC, yp.id ASC;
  `;

  const params: any[] = [classId, gradeLevel, gradeLevel];
  if (courseId) params.push(courseId);
  params.push(today, today);

  const items = await db.getAllAsync<YearlyPlanItem>(query, ...params);
  if (!items || items.length === 0) {
    return null;
  }

  // Eğer bu haftada sadece 1 konu varsa doğrudan o konuyu döndür
  if (items.length === 1) {
    return items[0];
  }

  // Eğer bu haftada birden fazla konu varsa (örneğin Kuvvet 2 saat, Hareket 2 saat):
  // Bu ders saatinin haftalık kaçıncı ders saati olduğunu haftalık programdan tespit et
  if (dayOfWeek && slotId && courseId) {
    const scheduleSlots = await db.getAllAsync<{ day_of_week: number; slot_id: number }>(`
      SELECT s.day_of_week, s.slot_id
      FROM schedules s
      JOIN lesson_slots ls ON ls.id = s.slot_id
      WHERE s.class_id = ? AND s.course_id = ?
      ORDER BY s.day_of_week ASC, ls.slot_number ASC
    `, classId, courseId);

    const matchIndex = scheduleSlots.findIndex(
      (s) => s.day_of_week === dayOfWeek && s.slot_id === slotId
    );

    if (matchIndex >= 0) {
      const currentLessonHourInWeek = matchIndex + 1; // 1, 2, 3, 4...

      // Konuların ders saati sınırlarına göre kümülatif olarak hangi konuya denk geldiğini bul:
      let accumulatedHours = 0;
      for (const item of items) {
        const hours = item.lesson_hours && item.lesson_hours > 0 ? item.lesson_hours : 2;
        accumulatedHours += hours;
        if (currentLessonHourInWeek <= accumulatedHours) {
          return item;
        }
      }
      return items[items.length - 1];
    }
  }

  return items[0];
};

export interface LessonTopicSurroundingInfo {
  found: boolean;
  gradeLevel: number | null;
  className: string;
  courseName: string;
  allTopics: YearlyPlanItem[];
  currentIndex: number;
  currentTopic: YearlyPlanItem | null;
  previousTopics: { offset: number; item: YearlyPlanItem }[];
  nextTopics: { offset: number; item: YearlyPlanItem }[];
}

/**
 * Belirli bir ders saati için o derste deftere yazılacak metni, 
 * önceki 2 dersin metnini ve sonraki 2 dersin metnini getirir.
 */
export const getSurroundingTopicsForLesson = async (
  classId: number,
  courseId: number,
  dayOfWeek?: number,
  slotId?: number,
  referenceDate?: string
): Promise<LessonTopicSurroundingInfo> => {
  const db = await getDB();
  const today = referenceDate || getTodayDateString();

  // 1. Sınıf adını ve düzeyini al
  const classRow = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM classes WHERE id = ?',
    classId
  );
  let gradeLevel: number | null = null;
  const className = classRow?.name || '';
  if (classRow) {
    const m = classRow.name.match(/\d+/);
    if (m) gradeLevel = parseInt(m[0], 10);
  }

  // 2. Ders adını al
  const courseRow = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM courses WHERE id = ?',
    courseId
  );
  const courseName = courseRow?.name || '';

  // 3. Bu sınıf ve ders için tüm yıllık plan konularını sırayla çek
  const query = `
    SELECT 
      yp.id,
      yp.course_id,
      cr.name as course_name,
      cr.code as course_code,
      yp.class_id,
      c.name as class_name,
      yp.grade_level,
      yp.lesson_hours,
      yp.week_number,
      yp.date_start,
      yp.date_end,
      yp.subject_topic,
      yp.learning_outcomes
    FROM yearly_plans yp
    LEFT JOIN courses cr ON cr.id = yp.course_id
    LEFT JOIN classes c ON c.id = yp.class_id
    WHERE (
      yp.class_id = ? 
      OR (yp.class_id IS NULL AND (yp.grade_level = ? OR (yp.grade_level IS NULL AND ? IS NULL)))
    )
    AND yp.course_id = ?
    ORDER BY yp.week_number ASC, yp.id ASC;
  `;
  const allTopics = await db.getAllAsync<YearlyPlanItem>(
    query,
    classId,
    gradeLevel,
    gradeLevel,
    courseId
  );

  if (!allTopics || allTopics.length === 0) {
    return {
      found: false,
      gradeLevel,
      className,
      courseName,
      allTopics: [],
      currentIndex: -1,
      currentTopic: null,
      previousTopics: [],
      nextTopics: [],
    };
  }

  // 4. Hedef konuyu belirle:
  const weekItems = allTopics.filter(
    (it) => it.date_start && it.date_end && it.date_start <= today && it.date_end >= today
  );

  let targetId: number | null = null;

  if (weekItems.length === 1) {
    targetId = weekItems[0].id;
  } else if (weekItems.length > 1 && dayOfWeek && slotId) {
    const scheduleSlots = await db.getAllAsync<{ day_of_week: number; slot_id: number }>(`
      SELECT s.day_of_week, s.slot_id
      FROM schedules s
      JOIN lesson_slots ls ON ls.id = s.slot_id
      WHERE s.class_id = ? AND s.course_id = ?
      ORDER BY s.day_of_week ASC, ls.slot_number ASC
    `, classId, courseId);

    const matchIndex = scheduleSlots.findIndex(
      (s) => s.day_of_week === dayOfWeek && s.slot_id === slotId
    );
    if (matchIndex >= 0) {
      const currentLessonHourInWeek = matchIndex + 1;
      let accumulatedHours = 0;
      let picked = weekItems[0];
      for (const item of weekItems) {
        const hours = item.lesson_hours && item.lesson_hours > 0 ? item.lesson_hours : 1;
        accumulatedHours += hours;
        if (currentLessonHourInWeek <= accumulatedHours) {
          picked = item;
          break;
        }
      }
      targetId = picked.id;
    } else {
      targetId = weekItems[0].id;
    }
  } else if (weekItems.length > 0) {
    targetId = weekItems[0].id;
  }

  let currentIndex = -1;
  if (targetId !== null) {
    currentIndex = allTopics.findIndex((it) => it.id === targetId);
  }

  if (currentIndex < 0) {
    const futureIndex = allTopics.findIndex(
      (it) => it.date_start && it.date_start >= today
    );
    currentIndex = futureIndex >= 0 ? futureIndex : 0;
  }

  const currentTopic = allTopics[currentIndex] || null;

  // Son iki ders
  const previousTopics: { offset: number; item: YearlyPlanItem }[] = [];
  if (currentIndex - 2 >= 0) {
    previousTopics.push({ offset: -2, item: allTopics[currentIndex - 2] });
  }
  if (currentIndex - 1 >= 0) {
    previousTopics.push({ offset: -1, item: allTopics[currentIndex - 1] });
  }

  // Gelecek iki ders
  const nextTopics: { offset: number; item: YearlyPlanItem }[] = [];
  if (currentIndex + 1 < allTopics.length) {
    nextTopics.push({ offset: 1, item: allTopics[currentIndex + 1] });
  }
  if (currentIndex + 2 < allTopics.length) {
    nextTopics.push({ offset: 2, item: allTopics[currentIndex + 2] });
  }

  return {
    found: true,
    gradeLevel,
    className,
    courseName,
    allTopics,
    currentIndex,
    currentTopic,
    previousTopics,
    nextTopics,
  };
};

// --- YEARLY PLAN PDF DOCUMENT ATTACHMENT ---
export interface YearlyPlanDocument {
  id: number;
  course_id: number;
  grade_level: number;
  file_name: string;
  file_uri: string;
  file_size?: number;
  created_at: string;
}

export const getYearlyPlanDocument = async (
  courseId: number,
  gradeLevel: number
): Promise<YearlyPlanDocument | null> => {
  const db = await getDB();
  return await db.getFirstAsync<YearlyPlanDocument>(
    'SELECT * FROM yearly_plan_documents WHERE course_id = ? AND grade_level = ?',
    courseId,
    gradeLevel
  );
};

export const saveYearlyPlanDocument = async (
  courseId: number,
  gradeLevel: number,
  fileName: string,
  fileUri: string,
  fileSize: number = 0
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO yearly_plan_documents (course_id, grade_level, file_name, file_uri, file_size)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(course_id, grade_level) DO UPDATE SET
       file_name = excluded.file_name,
       file_uri = excluded.file_uri,
       file_size = excluded.file_size,
       created_at = CURRENT_TIMESTAMP`,
    courseId,
    gradeLevel,
    fileName,
    fileUri,
    fileSize
  );
};

export const deleteYearlyPlanDocument = async (
  courseId: number,
  gradeLevel: number
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    'DELETE FROM yearly_plan_documents WHERE course_id = ? AND grade_level = ?',
    courseId,
    gradeLevel
  );
};
