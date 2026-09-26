import { getDB } from '../db';
import { YearlyPlanItem } from '../../types';
import { getTodayDateString } from '../../utils/dateUtils';

export const getYearlyPlans = async (
  courseId?: number,
  classId?: number
): Promise<YearlyPlanItem[]> => {
  const db = await getDB();
  const conditions: string[] = [];
  const params: any[] = [];

  if (courseId) {
    conditions.push('yp.course_id = ?');
    params.push(courseId);
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
      yp.class_id,
      c.name as class_name,
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
  learningOutcomes?: string
): Promise<number> => {
  const db = await getDB();
  const res = await db.runAsync(
    `INSERT INTO yearly_plans 
     (course_id, class_id, week_number, subject_topic, date_start, date_end, learning_outcomes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    courseId,
    classId || null,
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
  learningOutcomes?: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `UPDATE yearly_plans 
     SET course_id = ?, class_id = ?, week_number = ?, subject_topic = ?, 
         date_start = ?, date_end = ?, learning_outcomes = ?
     WHERE id = ?`,
    courseId,
    classId || null,
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

export const getCurrentTopicForClass = async (
  classId: number,
  courseId?: number
): Promise<YearlyPlanItem | null> => {
  const db = await getDB();
  const today = getTodayDateString();

  // 1. Try finding by matching current date range
  let query = `
    SELECT 
      yp.id,
      yp.course_id,
      cr.name as course_name,
      yp.class_id,
      c.name as class_name,
      yp.week_number,
      yp.date_start,
      yp.date_end,
      yp.subject_topic,
      yp.learning_outcomes
    FROM yearly_plans yp
    LEFT JOIN courses cr ON cr.id = yp.course_id
    LEFT JOIN classes c ON c.id = yp.class_id
    WHERE (yp.class_id = ? OR yp.class_id IS NULL)
      ${courseId ? 'AND yp.course_id = ?' : ''}
      AND yp.date_start <= ? AND yp.date_end >= ?
    ORDER BY yp.class_id DESC, yp.id DESC
    LIMIT 1;
  `;

  const params = courseId ? [classId, courseId, today, today] : [classId, today, today];
  const item = await db.getFirstAsync<YearlyPlanItem>(query, ...params);
  return item || null;
};
