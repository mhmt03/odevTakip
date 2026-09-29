import { getDB } from '../db';
import { StudentGrades, QuizItem, QuizScoreItem, StudentGradeRow } from '../../types';
import { getStudentsByClass } from './studentOperations';

// --- STUDENT GRADES (Yazılı & Performans) ---

export const getGradesByClassAndTerm = async (
  classId: number,
  term: number
): Promise<StudentGrades[]> => {
  const db = await getDB();
  return await db.getAllAsync<StudentGrades>(
    'SELECT * FROM student_grades WHERE class_id = ? AND term = ?',
    classId,
    term
  );
};

export const getGradesByStudentAndTerm = async (
  studentId: number,
  term: number
): Promise<StudentGrades | null> => {
  const db = await getDB();
  const row = await db.getFirstAsync<StudentGrades>(
    'SELECT * FROM student_grades WHERE student_id = ? AND term = ?',
    studentId,
    term
  );
  return row || null;
};

export const saveStudentGrades = async (
  studentId: number,
  classId: number,
  term: number,
  grades: {
    exam1?: number | null;
    exam2?: number | null;
    exam3?: number | null;
    perf1?: number | null;
    perf2?: number | null;
    perf3?: number | null;
  }
): Promise<void> => {
  const db = await getDB();

  await db.runAsync(
    `INSERT INTO student_grades (student_id, class_id, term, exam1, exam2, exam3, perf1, perf2, perf3, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(student_id, term) DO UPDATE SET
       class_id = excluded.class_id,
       exam1 = excluded.exam1,
       exam2 = excluded.exam2,
       exam3 = excluded.exam3,
       perf1 = excluded.perf1,
       perf2 = excluded.perf2,
       perf3 = excluded.perf3,
       updated_at = CURRENT_TIMESTAMP`,
    studentId,
    classId,
    term,
    grades.exam1 !== undefined ? grades.exam1 : null,
    grades.exam2 !== undefined ? grades.exam2 : null,
    grades.exam3 !== undefined ? grades.exam3 : null,
    grades.perf1 !== undefined ? grades.perf1 : null,
    grades.perf2 !== undefined ? grades.perf2 : null,
    grades.perf3 !== undefined ? grades.perf3 : null
  );
};

// --- QUIZZES (Ders İçi Quizler) ---

export const getQuizzesByClassAndTerm = async (
  classId: number,
  term: number
): Promise<QuizItem[]> => {
  const db = await getDB();
  return await db.getAllAsync<QuizItem>(
    'SELECT * FROM quizzes WHERE class_id = ? AND term = ? ORDER BY id ASC',
    classId,
    term
  );
};

export const createQuiz = async (
  classId: number,
  term: number,
  title: string,
  maxScore: number = 100,
  quizDate?: string
): Promise<number> => {
  const db = await getDB();
  const res = await db.runAsync(
    'INSERT INTO quizzes (class_id, term, title, max_score, quiz_date) VALUES (?, ?, ?, ?, ?)',
    classId,
    term,
    title.trim(),
    maxScore,
    quizDate || new Date().toISOString().split('T')[0]
  );
  return res.lastInsertRowId;
};

export const deleteQuiz = async (quizId: number): Promise<void> => {
  const db = await getDB();
  await db.runAsync('DELETE FROM quiz_scores WHERE quiz_id = ?', quizId);
  await db.runAsync('DELETE FROM quizzes WHERE id = ?', quizId);
};

export const saveQuizScore = async (
  quizId: number,
  studentId: number,
  score: number | null
): Promise<void> => {
  const db = await getDB();
  if (score === null || score === undefined) {
    await db.runAsync(
      'DELETE FROM quiz_scores WHERE quiz_id = ? AND student_id = ?',
      quizId,
      studentId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO quiz_scores (quiz_id, student_id, score)
     VALUES (?, ?, ?)
     ON CONFLICT(quiz_id, student_id) DO UPDATE SET
       score = excluded.score`,
    quizId,
    studentId,
    score
  );
};

// --- GRADE CALCULATIONS ---

const calcAverage = (nums: (number | null | undefined)[]): number | null => {
  const valid = nums.filter((n): n is number => n !== null && n !== undefined && !isNaN(n));
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length) * 10) / 10;
};

// --- FULL CLASS GRADEBOOK ---

export const getFullClassGradebook = async (
  classId: number,
  term: number
): Promise<{ students: StudentGradeRow[]; quizzes: QuizItem[] }> => {
  const db = await getDB();
  const classStudents = await getStudentsByClass(classId);
  const gradesList = await getGradesByClassAndTerm(classId, term);
  const quizzes = await getQuizzesByClassAndTerm(classId, term);

  // Fetch all quiz scores for this class/term
  const quizScoresList = await db.getAllAsync<{
    quiz_id: number;
    student_id: number;
    score: number;
  }>(
    `SELECT qs.quiz_id, qs.student_id, qs.score
     FROM quiz_scores qs
     JOIN quizzes q ON q.id = qs.quiz_id
     WHERE q.class_id = ? AND q.term = ?`,
    classId,
    term
  );

  const gradesMap = new Map<number, StudentGrades>();
  for (const g of gradesList) {
    gradesMap.set(g.student_id, g);
  }

  const quizScoresMap = new Map<string, number>();
  for (const qs of quizScoresList) {
    quizScoresMap.set(`${qs.quiz_id}_${qs.student_id}`, qs.score);
  }

  const studentRows: StudentGradeRow[] = classStudents.map((st) => {
    const g = gradesMap.get(st.id);
    const exam1 = g?.exam1 ?? null;
    const exam2 = g?.exam2 ?? null;
    const exam3 = g?.exam3 ?? null;
    const perf1 = g?.perf1 ?? null;
    const perf2 = g?.perf2 ?? null;
    const perf3 = g?.perf3 ?? null;

    const quizScores: Record<number, number | null> = {};
    const quizScoreValues: (number | null)[] = [];

    for (const q of quizzes) {
      const key = `${q.id}_${st.id}`;
      const score = quizScoresMap.has(key) ? quizScoresMap.get(key)! : null;
      quizScores[q.id] = score;
      quizScoreValues.push(score);
    }

    const examAvg = calcAverage([exam1, exam2, exam3]);
    const perfAvg = calcAverage([perf1, perf2, perf3]);
    const quizAvg = calcAverage(quizScoreValues);

    // Standard school overall: average of all entered exam & performance notes
    const allMainGrades = [exam1, exam2, exam3, perf1, perf2, perf3].filter(
      (n): n is number => n !== null && n !== undefined && !isNaN(n)
    );
    const overallAvg =
      allMainGrades.length > 0
        ? Math.round(
            (allMainGrades.reduce((a, b) => a + b, 0) / allMainGrades.length) * 10
          ) / 10
        : null;

    return {
      student_id: st.id,
      student_number: st.student_number,
      first_name: st.first_name,
      last_name: st.last_name,
      photo_uri: st.photo_uri,
      exam1,
      exam2,
      exam3,
      perf1,
      perf2,
      perf3,
      quizScores,
      examAvg,
      perfAvg,
      quizAvg,
      overallAvg,
    };
  });

  return {
    students: studentRows,
    quizzes,
  };
};

export const bulkSaveGradebookFromExcel = async (
  classId: number,
  term: number,
  records: Array<{
    studentId: number;
    exam1?: number | null;
    exam2?: number | null;
    exam3?: number | null;
    perf1?: number | null;
    perf2?: number | null;
    perf3?: number | null;
    quizScores?: Record<number, number | null>;
  }>
): Promise<{ updatedCount: number }> => {
  let updatedCount = 0;
  for (const rec of records) {
    await saveStudentGrades(rec.studentId, classId, term, {
      exam1: rec.exam1,
      exam2: rec.exam2,
      exam3: rec.exam3,
      perf1: rec.perf1,
      perf2: rec.perf2,
      perf3: rec.perf3,
    });

    if (rec.quizScores) {
      for (const [quizIdStr, score] of Object.entries(rec.quizScores)) {
        const quizId = parseInt(quizIdStr, 10);
        if (!isNaN(quizId)) {
          await saveQuizScore(quizId, rec.studentId, score);
        }
      }
    }
    updatedCount++;
  }
  return { updatedCount };
};
