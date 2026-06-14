import sqlite3
import os
import json
from datetime import datetime, date, timedelta
import uuid

DB_PATH = os.path.join(os.path.dirname(__file__), 'rotina.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS stress_levels (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            weight INTEGER NOT NULL,
            allowed_activity_types TEXT NOT NULL DEFAULT '[]',
            color TEXT NOT NULL DEFAULT '#888888',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fixed_blocks (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            day_of_week INTEGER NOT NULL,
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
            is_event INTEGER NOT NULL DEFAULT 0,
            event_date TEXT,
            start_time TEXT,
            end_time TEXT,
            external_id TEXT,
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
            source_type TEXT NOT NULL,
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
    """)

    count = c.execute("SELECT COUNT(*) FROM stress_levels").fetchone()[0]
    if count == 0:
        defaults = [
            (str(uuid.uuid4()), 'Leve', 1, json.dumps(['exercise','reading','study','leisure','rest']), '#22c55e'),
            (str(uuid.uuid4()), 'Moderado', 3, json.dumps(['reading','study','leisure','rest']), '#f59e0b'),
            (str(uuid.uuid4()), 'Pesado', 5, json.dumps(['leisure','rest']), '#ef4444'),
        ]
        c.executemany("INSERT INTO stress_levels (id,label,weight,allowed_activity_types,color) VALUES (?,?,?,?,?)", defaults)

    conn.commit()
    conn.close()

def migrate_db():
    conn = get_db()
    c = conn.cursor()
    existing = {r[1] for r in c.execute("PRAGMA table_info(tasks)").fetchall()}
    for col, definition in [
        ('is_event',    'INTEGER NOT NULL DEFAULT 0'),
        ('event_date',  'TEXT'),
        ('start_time',  'TEXT'),
        ('end_time',    'TEXT'),
        ('external_id', 'TEXT'),
    ]:
        if col not in existing:
            c.execute(f"ALTER TABLE tasks ADD COLUMN {col} {definition}")
    conn.commit()
    conn.close()

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)
