import { getDB } from '../db';
import { Assignment, AssignmentStudent, AssignmentStatus } from '../../types';

export const getAssignments = async (classId?: number): Promise<Assignment[]> => {
  const db = await getDB();
  const whereClause = classId ? 'WHERE a.class_id = ?' : '';
  const params = classId ? [classId] : [];

  const query = `
    SELECT 
      a.id, 
      a.class_id, 
      c.name as class_name,
      a.title, 
      a.description, 
      a.assigned_date, 
      a.due_date, 
      a.created_at,
      COUNT(ast.id) as total_students,
      SUM(CASE WHEN ast.status = 'yapildi' THEN 1 ELSE 0 END) as completed_count,
      SUM(CASE WHEN ast.status = 'yapilmadi' THEN 1 ELSE 0 END) as missing_count,
      SUM(CASE WHEN ast.status = 'bekliyor' AND ast.is_exempt = 0 THEN 1 ELSE 0 END) as pending_count
    FROM assignments a
    LEFT JOIN classes c ON c.id = a.class_id
    LEFT JOIN assignment_students ast ON ast.assignment_id = a.id
    ${whereClause}
    GROUP BY a.id
    ORDER BY a.assigned_date DESC, a.id DESC;
  `;
  return await db.getAllAsync<Assignment>(query, ...params);
};

export const getAssignmentById = async (id: number): Promise<Assignment | null> => {
  const db = await getDB();
  const query = `
    SELECT 
      a.id, 
      a.class_id, 
      c.name as class_name,
      a.title, 
      a.description, 
      a.assigned_date, 
      a.due_date, 
      a.created_at,
      COUNT(ast.id) as total_students,
      SUM(CASE WHEN ast.status = 'yapildi' THEN 1 ELSE 0 END) as completed_count,
      SUM(CASE WHEN ast.status = 'yapilmadi' THEN 1 ELSE 0 END) as missing_count,
      SUM(CASE WHEN ast.status = 'bekliyor' AND ast.is_exempt = 0 THEN 1 ELSE 0 END) as pending_count
    FROM assignments a
    LEFT JOIN classes c ON c.id = a.class_id
    LEFT JOIN assignment_students ast ON ast.assignment_id = a.id
    WHERE a.id = ?
    GROUP BY a.id;
  `;
  return await db.getFirstAsync<Assignment>(query, id);
};

export const getAssignmentStudents = async (assignmentId: number): Promise<AssignmentStudent[]> => {
  const db = await getDB();
  const query = `
    SELECT 
      ast.id,
      ast.assignment_id,
      ast.student_id,
      s.student_number,
      s.first_name,
      s.last_name,
      ast.is_exempt,
      ast.status,
      ast.note,
      ast.updated_at
    FROM assignment_students ast
    JOIN students s ON s.id = ast.student_id
    WHERE ast.assignment_id = ?
    ORDER BY CAST(s.student_number AS INTEGER) ASC, s.first_name ASC;
  `;
  return await db.getAllAsync<AssignmentStudent>(query, assignmentId);
};

export interface CreateAssignmentParams {
  classId: number;
  title: string;
  description?: string;
  assignedDate: string;
  dueDate: string;
  // studentId -> isSelected (true if checked / homework assigned; false if unchecked / exempt)
  studentSelections: { studentId: number; isSelected: boolean }[];
}

export const createAssignment = async (params: CreateAssignmentParams): Promise<number> => {
  const db = await getDB();
  let assignmentId = 0;

  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO assignments (class_id, title, description, assigned_date, due_date)
       VALUES (?, ?, ?, ?, ?)`,
      params.classId,
      params.title.trim(),
      params.description?.trim() || '',
      params.assignedDate,
      params.dueDate
    );
    assignmentId = res.lastInsertRowId;

    for (const item of params.studentSelections) {
      const isExempt = item.isSelected ? 0 : 1;
      const initialStatus = isExempt ? 'muaf' : 'bekliyor';
      await db.runAsync(
        `INSERT INTO assignment_students (assignment_id, student_id, is_exempt, status)
         VALUES (?, ?, ?, ?)`,
        assignmentId,
        item.studentId,
        isExempt,
        initialStatus
      );
    }
  });

  return assignmentId;
};

export const updateAssignment = async (
  id: number,
  title: string,
  description?: string,
  assignedDate?: string,
  dueDate?: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `UPDATE assignments 
     SET title = ?, description = ?, assigned_date = COALESCE(?, assigned_date), due_date = COALESCE(?, due_date) 
     WHERE id = ?`,
    title.trim(),
    description?.trim() || '',
    assignedDate ?? null,
    dueDate ?? null,
    id
  );
};

export const updateAssignmentStudentStatus = async (
  assignmentStudentId: number,
  status: AssignmentStatus,
  note?: string
): Promise<void> => {
  const db = await getDB();
  await db.runAsync(
    `UPDATE assignment_students 
     SET status = ?, note = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    status,
    note || '',
    assignmentStudentId
  );
};

export const deleteAssignment = async (id: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM assignments WHERE id = ?', id);
};
