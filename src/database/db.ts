import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDB = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('sinif_takip.db');
    await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
};

export const initDatabase = async (): Promise<void> => {
  const db = await getDB();

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assigned_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignment_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      is_exempt INTEGER DEFAULT 0,
      status TEXT DEFAULT 'bekliyor',
      note TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS student_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      note_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS lesson_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_number INTEGER NOT NULL UNIQUE,
      slot_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL,
      slot_id INTEGER NOT NULL,
      class_id INTEGER,
      course_id INTEGER,
      classroom TEXT,
      FOREIGN KEY (slot_id) REFERENCES lesson_slots(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
      UNIQUE(day_of_week, slot_id)
    );

    CREATE TABLE IF NOT EXISTS yearly_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      class_id INTEGER,
      week_number INTEGER NOT NULL,
      date_start TEXT,
      date_end TEXT,
      subject_topic TEXT NOT NULL,
      learning_outcomes TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
    );
  `);

  // Seed default courses if table is empty
  const courseCountRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM courses');
  if (courseCountRow && courseCountRow.count === 0) {
    const starterCourses = [
      { name: 'Fizik', code: 'FİZ', color: '#4F46E5' },
      { name: 'Astronomi', code: 'AST', color: '#0EA5E9' },
      { name: 'Matematik', code: 'MAT', color: '#10B981' },
      { name: 'Kimya', code: 'KİM', color: '#F59E0B' },
      { name: 'Biyoloji', code: 'BİY', color: '#84CC16' },
      { name: 'Türk Dili ve Edebiyatı', code: 'EDB', color: '#EC4899' },
      { name: 'Tarih', code: 'TAR', color: '#8B5CF6' },
      { name: 'Coğrafya', code: 'COĞ', color: '#14B8A6' },
    ];
    for (const c of starterCourses) {
      await db.runAsync(
        'INSERT OR IGNORE INTO courses (name, code, color) VALUES (?, ?, ?)',
        c.name,
        c.code,
        c.color
      );
    }
  }

  // Seed default lesson slots if empty
  const slotCountRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM lesson_slots');
  if (slotCountRow && slotCountRow.count === 0) {
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
  }
};
