import * as SQLite from 'expo-sqlite';

// Fast Refresh sırasında modül yeniden yüklendiğinde aynı bağlantıyı kullanmak için
// bağlantıyı globalThis üzerinde saklıyoruz. Aksi halde eski (kapanmış) native
// bağlantıya giden istekler NullPointerException ile reddediliyor.
const g = globalThis as any;
let dbInstance: SQLite.SQLiteDatabase | null = g.__sinifTakipDB ?? null;
let dbOpenPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const setInstance = (db: SQLite.SQLiteDatabase | null) => {
  dbInstance = db;
  g.__sinifTakipDB = db;
};

export const resetDB = () => {
  setInstance(null);
  dbOpenPromise = null;
};

export const closeDatabase = async (): Promise<void> => {
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
    } catch (e) {
      console.warn('Error closing database:', e);
    }
    setInstance(null);
    dbOpenPromise = null;
  }
};

const openFresh = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await SQLite.openDatabaseAsync('sinif_takip.db');
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  setInstance(db);
  return db;
};

export const getDB = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbOpenPromise) {
    return await dbOpenPromise;
  }

  dbOpenPromise = (async () => {
    try {
      return await openFresh();
    } catch (err) {
      setInstance(null);
      throw err;
    } finally {
      dbOpenPromise = null;
    }
  })();

  return await dbOpenPromise;
};

/** Mevcut bağlantının hâlâ geçerli olduğunu doğrular; değilse yeniden açar. */
const ensureHealthyDB = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await getDB();
  try {
    await db.getFirstAsync('SELECT 1');
    return db;
  } catch (e) {
    console.warn('Stale DB connection detected, reopening...', e);
    setInstance(null);
    return await openFresh();
  }
};

const runSchema = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      color TEXT DEFAULT '#4F46E5',
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      notes TEXT,
      photo_uri TEXT,
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
      lesson_info TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS class_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      note_date TEXT NOT NULL,
      lesson_info TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

    CREATE TABLE IF NOT EXISTS day_slot_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL,
      slot_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (slot_id) REFERENCES lesson_slots(id) ON DELETE CASCADE,
      UNIQUE(day_of_week, slot_id)
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
      grade_level INTEGER,
      lesson_hours INTEGER DEFAULT 0,
      week_number INTEGER NOT NULL,
      date_start TEXT,
      date_end TEXT,
      subject_topic TEXT NOT NULL,
      learning_outcomes TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quick_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS yearly_plan_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      grade_level INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(course_id, grade_level)
    );

    CREATE TABLE IF NOT EXISTS student_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      term INTEGER NOT NULL DEFAULT 1,
      exam1 REAL,
      exam2 REAL,
      exam3 REAL,
      perf1 REAL,
      perf2 REAL,
      perf3 REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      UNIQUE(student_id, term)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      term INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      max_score REAL DEFAULT 100,
      quiz_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      score REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(quiz_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate: ensure school_id column exists in classes table
  try {
    await db.runAsync('ALTER TABLE classes ADD COLUMN school_id INTEGER;');
  } catch {
    // Column already exists
  }

  // Seed default school if schools table is empty
  const schoolCountRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM schools');
  if (schoolCountRow && schoolCountRow.count === 0) {
    const defaultSchoolResult = await db.runAsync(
      'INSERT INTO schools (name, color, is_active) VALUES (?, ?, 1)',
      'Merkez Okulu',
      '#4F46E5'
    );
    const defaultSchoolId = defaultSchoolResult.lastInsertRowId;
    await db.runAsync('UPDATE classes SET school_id = ? WHERE school_id IS NULL', defaultSchoolId);
  } else {
    // Check if there is an active school; if not, activate first school
    const activeSchoolRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools WHERE is_active = 1 LIMIT 1');
    if (!activeSchoolRow) {
      const firstSchool = await db.getFirstAsync<{ id: number }>('SELECT id FROM schools ORDER BY id ASC LIMIT 1');
      if (firstSchool) {
        await db.runAsync('UPDATE schools SET is_active = 1 WHERE id = ?', firstSchool.id);
        await db.runAsync('UPDATE classes SET school_id = ? WHERE school_id IS NULL', firstSchool.id);
      }
    } else {
      await db.runAsync('UPDATE classes SET school_id = ? WHERE school_id IS NULL', activeSchoolRow.id);
    }
  }

  // Migrate: ensure grade_level and lesson_hours exist in yearly_plans table
  try {
    await db.runAsync('ALTER TABLE yearly_plans ADD COLUMN grade_level INTEGER;');
  } catch {
    // Column already exists
  }
  try {
    await db.runAsync('ALTER TABLE yearly_plans ADD COLUMN lesson_hours INTEGER DEFAULT 0;');
  } catch {
    // Column already exists
  }

  // Migrate: ensure lesson_info column exists in student_notes table
  try {
    await db.runAsync('ALTER TABLE student_notes ADD COLUMN lesson_info TEXT;');
  } catch {
    // Column already exists
  }

  // Migrate: ensure class_notes table exists
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS class_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        note TEXT NOT NULL,
        note_date TEXT NOT NULL,
        lesson_info TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      );
    `);
  } catch {
    // Table already exists
  }

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

  // Seed default quick notes if empty
  const quickNoteCountRow = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM quick_notes');
  if (quickNoteCountRow && quickNoteCountRow.count === 0) {
    const starterQuickNotes = [
      'Derste çok aktifti 👍',
      'Ödevini getirmedi ❌',
      'Derste konuştu / dikkati dağınıktı ⚠️',
      'Soruları doğru çözdü ⭐',
      'Dersi dikkatle dinledi 📖',
      'Rehberlik görüşmesi yapıldı 💬',
      'Söz hakkı aldı ve katkı sağladı 👏',
      'Kitap / defter getirmedi 📚',
    ];
    for (let i = 0; i < starterQuickNotes.length; i++) {
      await db.runAsync(
        'INSERT INTO quick_notes (text, sort_order) VALUES (?, ?)',
        starterQuickNotes[i],
        i + 1
      );
    }
  }
};

export const initDatabase = async (): Promise<void> => {
  try {
    const db = await ensureHealthyDB();
    await runSchema(db);
  } catch (err) {
    console.warn('Initial initDatabase failed, recreating connection...', err);
    setInstance(null);
    const db = await openFresh();
    await runSchema(db);
  }
};
