import initSqlJs, { Database as SqlDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data/proctor.sqlite');

let dbInstance: SqlDatabase | null = null;

export async function getDb(): Promise<SqlDatabase> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  initTables(dbInstance);
  saveDb();
  return dbInstance;
}

export function saveDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save SQLite DB to disk:', err);
  }
}

function initTables(db: SqlDatabase) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'invigilator',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      shuffle_questions INTEGER NOT NULL DEFAULT 0,
      max_violations INTEGER NOT NULL DEFAULT 5,
      google_form_embed_url TEXT,
      created_by TEXT,
      retention_days INTEGER NOT NULL DEFAULT 30,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      marks REAL NOT NULL DEFAULT 1.0,
      order_num INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      email TEXT,
      consent_agreed INTEGER NOT NULL DEFAULT 1,
      consent_timestamp TEXT NOT NULL,
      reference_photo_url TEXT,
      hardware_details TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      start_time TEXT,
      end_time TEXT,
      added_time_seconds INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT DEFAULT '{}',
      score REAL,
      total_marks REAL DEFAULT 0,
      risk_score REAL DEFAULT 0,
      socket_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS violations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      screenshot_path TEXT,
      webcam_path TEXT,
      details TEXT,
      FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS warnings_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_by TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    );
  `);
}

// Helper query utilities
export class DB {
  static async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await getDb();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  static async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const all = await this.queryAll<T>(sql, params);
    return all.length > 0 ? all[0] : null;
  }

  static async run(sql: string, params: any[] = []): Promise<void> {
    const db = await getDb();
    db.run(sql, params);
    saveDb();
  }
}
