import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DASHBOARD_DB_PATH || "./data/dashboard.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  student_folder TEXT,
  source_file TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  student_name TEXT,
  exam_level TEXT,
  genre TEXT,
  topic_title TEXT,
  word_count_est INTEGER,
  report_date_text TEXT,
  content_score INTEGER,
  ca_score INTEGER,
  org_score INTEGER,
  lang_score INTEGER,
  total_score_20 INTEGER,
  ces_score INTEGER,
  cefr_level TEXT,
  overall_comment TEXT,
  risk_flag INTEGER DEFAULT 0,
  raw_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  student_folder TEXT,
  folder_path TEXT,
  file_count INTEGER,
  success_count INTEGER,
  failed_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS import_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  batch_id TEXT,
  source_file TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  student_name TEXT,
  exam_level TEXT,
  genre TEXT,
  prompt_text TEXT,
  student_text TEXT,
  total_score_20 INTEGER,
  ces_score INTEGER,
  cefr_level TEXT,
  report_html TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_name ON report_records(student_name);
CREATE INDEX IF NOT EXISTS idx_topic_title ON report_records(topic_title);
CREATE INDEX IF NOT EXISTS idx_total_score ON report_records(total_score_20);
CREATE INDEX IF NOT EXISTS idx_risk_flag ON report_records(risk_flag);
CREATE INDEX IF NOT EXISTS idx_batch_id ON report_records(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_report_user_id ON report_records(user_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_user_id ON import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_import_failures_user_id ON import_failures(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_generated_user_id ON generated_reports(user_id);
`);

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const has = cols.some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("report_records", "student_folder", "TEXT");
ensureColumn("import_batches", "student_folder", "TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_report_student_folder ON report_records(student_folder)");

const stmtCreateUser = db.prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)");
const stmtGetUserByUsername = db.prepare("SELECT * FROM users WHERE username = ?");
const stmtGetUserById = db.prepare("SELECT id, username, display_name, created_at FROM users WHERE id = ?");
const stmtCreateSession = db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)");
const stmtDeleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");
const stmtDeleteExpiredSessions = db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')");
const stmtGetUserBySession = db.prepare(`
  SELECT u.id, u.username, u.display_name, s.token, s.expires_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
`);

const insertBatchStmt = db.prepare(`
  INSERT INTO import_batches (id, user_id, student_folder, folder_path, file_count, success_count, failed_count)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateBatchStmt = db.prepare(`
  UPDATE import_batches
  SET success_count = ?, failed_count = ?
  WHERE id = ? AND user_id = ?
`);

const insertFailureStmt = db.prepare(`
  INSERT INTO import_failures (user_id, batch_id, source_file, reason)
  VALUES (?, ?, ?, ?)
`);

const insertRecordStmt = db.prepare(`
  INSERT INTO report_records (
    user_id, student_folder, source_file, import_batch_id, student_name, exam_level, genre, topic_title,
    word_count_est, report_date_text, content_score, ca_score, org_score, lang_score,
    total_score_20, ces_score, cefr_level, overall_comment, risk_flag, raw_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertGeneratedStmt = db.prepare(`
  INSERT INTO generated_reports (
    user_id, student_name, exam_level, genre, prompt_text, student_text,
    total_score_20, ces_score, cefr_level, report_html
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function createUser({ username, passwordHash, displayName }) {
  stmtCreateUser.run(username, passwordHash, displayName || null);
  return stmtGetUserByUsername.get(username);
}

export function getUserByUsername(username) {
  return stmtGetUserByUsername.get(username);
}

export function getUserSafeById(userId) {
  return stmtGetUserById.get(userId);
}

export function createSession({ userId, token, expiresAt }) {
  stmtDeleteExpiredSessions.run();
  stmtCreateSession.run(userId, token, expiresAt);
}

export function deleteSession(token) {
  stmtDeleteSession.run(token);
}

export function getUserFromSession(token) {
  if (!token) return null;
  stmtDeleteExpiredSessions.run();
  return stmtGetUserBySession.get(token) || null;
}

export function addGeneratedReport(report) {
  insertGeneratedStmt.run(
    report.user_id,
    report.student_name,
    report.exam_level,
    report.genre,
    report.prompt_text,
    report.student_text,
    report.total_score_20,
    report.ces_score,
    report.cefr_level,
    report.report_html
  );
}

export function getArchiveSummary(userId) {
  return db.prepare(`
    SELECT
      COUNT(*) AS total_reports,
      ROUND(AVG(total_score_20), 2) AS avg_total_20,
      ROUND(AVG(ces_score), 2) AS avg_ces
    FROM generated_reports
    WHERE user_id = ?
  `).get(userId);
}

export function getArchiveReports(userId, limit = 200) {
  return db.prepare(`
    SELECT id, student_name, exam_level, genre, total_score_20, ces_score, cefr_level, created_at
    FROM generated_reports
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(userId, limit);
}

export function getArchiveReportById(userId, reportId) {
  return db.prepare(`
    SELECT *
    FROM generated_reports
    WHERE user_id = ? AND id = ?
  `).get(userId, reportId);
}

export function createImportBatch({ id, userId, studentFolder, folderPath, fileCount }) {
  insertBatchStmt.run(id, userId, studentFolder || null, folderPath || null, fileCount || 0, 0, 0);
}

export function finalizeImportBatch({ id, userId, successCount, failedCount }) {
  updateBatchStmt.run(successCount, failedCount, id, userId);
}

export function addImportFailure({ userId, batchId, sourceFile, reason }) {
  insertFailureStmt.run(userId, batchId, sourceFile, reason);
}

export function addReportRecord(record) {
  insertRecordStmt.run(
    record.user_id,
    record.student_folder || null,
    record.source_file,
    record.import_batch_id,
    record.student_name,
    record.exam_level,
    record.genre,
    record.topic_title,
    record.word_count_est,
    record.report_date_text,
    record.content_score,
    record.ca_score,
    record.org_score,
    record.lang_score,
    record.total_score_20,
    record.ces_score,
    record.cefr_level,
    record.overall_comment,
    record.risk_flag,
    record.raw_text
  );
}

function buildFilterClause(userId, filters = {}) {
  const clauses = ["user_id = ?"];
  const params = [userId];

  if (filters.name) {
    clauses.push("student_name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.topic) {
    clauses.push("topic_title LIKE ?");
    params.push(`%${filters.topic}%`);
  }
  if (filters.folder) {
    clauses.push("student_folder LIKE ?");
    params.push(`%${filters.folder}%`);
  }
  if (filters.riskOnly) {
    clauses.push("risk_flag = 1");
  }
  if (Number.isFinite(filters.scoreMin)) {
    clauses.push("total_score_20 >= ?");
    params.push(filters.scoreMin);
  }
  if (Number.isFinite(filters.scoreMax)) {
    clauses.push("total_score_20 <= ?");
    params.push(filters.scoreMax);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return { where, params };
}

export function getSummary(userId, filters = {}) {
  const { where, params } = buildFilterClause(userId, filters);

  const summary = db.prepare(`
    SELECT
      ROUND(AVG(total_score_20), 2) AS avg_total_20,
      ROUND(AVG(ces_score), 2) AS avg_ces,
      COUNT(*) AS total_records,
      SUM(CASE WHEN risk_flag = 1 THEN 1 ELSE 0 END) AS risk_count
    FROM report_records
    ${where}
  `).get(...params);

  const distribution = db.prepare(`
    SELECT bucket, COUNT(*) AS count FROM (
      SELECT CASE
        WHEN total_score_20 BETWEEN 0 AND 7 THEN '0-7'
        WHEN total_score_20 BETWEEN 8 AND 11 THEN '8-11'
        WHEN total_score_20 BETWEEN 12 AND 14 THEN '12-14'
        WHEN total_score_20 BETWEEN 15 AND 17 THEN '15-17'
        WHEN total_score_20 BETWEEN 18 AND 20 THEN '18-20'
        ELSE 'unknown'
      END AS bucket
      FROM report_records
      ${where}
    ) t
    GROUP BY bucket
    ORDER BY CASE bucket
      WHEN '0-7' THEN 1
      WHEN '8-11' THEN 2
      WHEN '12-14' THEN 3
      WHEN '15-17' THEN 4
      WHEN '18-20' THEN 5
      ELSE 6 END
  `).all(...params);

  const riskStudents = db.prepare(`
    SELECT id, student_name, topic_title, total_score_20, lang_score, ces_score, created_at
    FROM report_records
    ${where} AND risk_flag = 1
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 50
  `).all(...params);

  return {
    avg_total_20: summary?.avg_total_20 ?? 0,
    avg_ces: summary?.avg_ces ?? 0,
    total_records: summary?.total_records ?? 0,
    risk_count: summary?.risk_count ?? 0,
    distribution,
    risk_students: riskStudents,
  };
}

export function getStudents(userId, filters = {}) {
  const { where, params } = buildFilterClause(userId, filters);

  return db.prepare(`
    SELECT
      COALESCE(student_name, '未命名') AS student_name,
      COUNT(*) AS records_count,
      ROUND(AVG(total_score_20), 2) AS avg_total,
      MIN(total_score_20) AS min_total,
      MAX(total_score_20) AS max_total,
      (
        SELECT r2.total_score_20
        FROM report_records r2
        WHERE r2.user_id = ? AND r2.student_name = r1.student_name
        ORDER BY datetime(r2.created_at) DESC, r2.id DESC
        LIMIT 1
      ) AS latest_total,
      (
        SELECT r2.ces_score
        FROM report_records r2
        WHERE r2.user_id = ? AND r2.student_name = r1.student_name
        ORDER BY datetime(r2.created_at) DESC, r2.id DESC
        LIMIT 1
      ) AS latest_ces,
      (
        SELECT r2.created_at
        FROM report_records r2
        WHERE r2.user_id = ? AND r2.student_name = r1.student_name
        ORDER BY datetime(r2.created_at) DESC, r2.id DESC
        LIMIT 1
      ) AS latest_created_at,
      SUM(CASE WHEN risk_flag = 1 THEN 1 ELSE 0 END) AS risk_records
    FROM report_records r1
    ${where}
    GROUP BY student_name
    ORDER BY datetime(latest_created_at) DESC
  `).all(userId, userId, userId, ...params);
}

export function getStudentRecords(userId, studentName) {
  return db.prepare(`
    SELECT *
    FROM report_records
    WHERE user_id = ? AND student_name = ?
    ORDER BY datetime(created_at) DESC, id DESC
  `).all(userId, studentName);
}

export function getFilteredRecords(userId, filters = {}) {
  const { where, params } = buildFilterClause(userId, filters);
  return db.prepare(`
    SELECT * FROM report_records
    ${where}
    ORDER BY datetime(created_at) DESC, id DESC
  `).all(...params);
}

export function getRecordById(userId, recordId) {
  return db.prepare("SELECT * FROM report_records WHERE user_id = ? AND id = ?").get(userId, recordId);
}

export function getRecordContentById(userId, recordId) {
  return db.prepare(`
    SELECT id, student_name, student_folder, topic_title, source_file, raw_text, created_at
    FROM report_records
    WHERE user_id = ? AND id = ?
  `).get(userId, recordId);
}

export function getFolderStats(userId) {
  return db.prepare(`
    SELECT
      COALESCE(student_folder, '未分组') AS student_folder,
      COUNT(*) AS records_count,
      ROUND(AVG(total_score_20), 2) AS avg_total
    FROM report_records
    WHERE user_id = ?
    GROUP BY COALESCE(student_folder, '未分组')
    ORDER BY records_count DESC, student_folder ASC
  `).all(userId);
}

export function deleteReportRecordById(userId, recordId) {
  const result = db.prepare("DELETE FROM report_records WHERE user_id = ? AND id = ?").run(userId, recordId);
  return result.changes || 0;
}

export function deleteAllStudentData(userId) {
  db.prepare("DELETE FROM report_records WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM import_failures WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM import_batches WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM generated_reports WHERE user_id = ?").run(userId);
}
