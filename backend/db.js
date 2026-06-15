const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'rotina.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS stress_levels (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    weight INTEGER NOT NULL CHECK(weight BETWEEN 1 AND 5),
    allowed_activity_types TEXT NOT NULL DEFAULT '[]',
    color TEXT NOT NULL DEFAULT '#888888',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fixed_blocks (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    stress_level_id TEXT REFERENCES stress_levels(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    preferred_time TEXT,
    days_of_week TEXT NOT NULL DEFAULT '[]',
    max_stress_weight INTEGER NOT NULL DEFAULT 5,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'personal',
    effort TEXT NOT NULL DEFAULT 'medium',
    estimated_minutes INTEGER NOT NULL DEFAULT 60,
    due_date TEXT,
    allow_split INTEGER NOT NULL DEFAULT 0,
    allow_weekend INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS day_plans (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    overall_stress_weight INTEGER NOT NULL DEFAULT 0,
    free_windows TEXT NOT NULL DEFAULT '[]',
    generated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_slots (
    id TEXT PRIMARY KEY,
    day_plan_id TEXT NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK(source_type IN ('habit','task')),
    source_id TEXT NOT NULL,
    suggested_start TEXT NOT NULL,
    suggested_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'suggested',
    chosen_from_suggestions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('weekend_enabled', 'false');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('planning_day', '0');
`);

// Seed stress levels padrão se vazio
const count = db.prepare('SELECT COUNT(*) as c FROM stress_levels').get();
if (count.c === 0) {
  const insert = db.prepare(`INSERT INTO stress_levels (id, label, weight, allowed_activity_types, color) VALUES (?,?,?,?,?)`);
  const { v4: uuidv4 } = require('uuid');
  insert.run(uuidv4(), 'Leve', 1, JSON.stringify(['exercise','reading','study','leisure','rest']), '#22c55e');
  insert.run(uuidv4(), 'Moderado', 3, JSON.stringify(['reading','study','leisure','rest']), '#f59e0b');
  insert.run(uuidv4(), 'Pesado', 5, JSON.stringify(['leisure','rest']), '#ef4444');
}

module.exports = db;
