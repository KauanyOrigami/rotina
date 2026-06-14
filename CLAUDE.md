# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (Python Flask, port 3001)
```bash
cd backend
pip install flask flask-cors
python3 server.py
```

### Frontend (React, port 3000)
```bash
cd frontend
npm install
npm start
```

### Run both together
```bash
chmod +x start.sh
./start.sh
```

The frontend reads `REACT_APP_API_URL` from `frontend/.env` (defaults to `http://localhost:3001`).

There are no tests or linters configured.

## Architecture Overview

**Rotina** is a Portuguese-language intelligent routine planner that schedules tasks and habits based on cognitive load. Stack: Flask + SQLite backend, React 18 frontend.

### Backend (`backend/`)

Three-layer structure:

- **[server.py](backend/server.py)** — Flask REST API. All routes: CRUD for stress levels, fixed blocks, habits, tasks, settings; plus day/week plan generation and slot status updates.
- **[database.py](backend/database.py)** — SQLite schema initialization (8 tables). The DB file `rotina.db` is auto-created on first run.
- **[scheduler.py](backend/scheduler.py)** — Core scheduling algorithm:
  - `compute_free_windows()` — finds gaps ≥30 min between fixed blocks
  - `compute_day_stress_weight()` — averages stress weights of that day's active fixed blocks (capped at 5)
  - `score_task()` — urgency scoring: +100 if due ≤1 day, +60 if ≤3 days
  - `generate_suggestions()` — for each free window, filters and ranks habits + tasks by cognitive load compatibility, day-of-week, divisibility, and preferred time; returns top 3 per window

The legacy Node.js files (`db.js`, `server.js`, `scheduler.js`) and `backend/package.json` are unused.

### Frontend (`frontend/src/`)

- **[lib/api.js](frontend/src/lib/api.js)** — single HTTP client; all API calls go through namespaced methods (`api.stressLevels`, `api.fixedBlocks`, `api.habits`, `api.tasks`, `api.dayPlan`, `api.slots`, etc.)
- **[App.jsx](frontend/src/App.jsx)** — root router with sidebar navigation
- **[pages/Today.jsx](frontend/src/pages/Today.jsx)** — core daily planning UI: shows free windows with 2–3 ranked suggestions, confirm/skip/done actions, stress bar
- **[pages/Week.jsx](frontend/src/pages/Week.jsx)** — 7-day calendar grid
- **[pages/Tasks.jsx](frontend/src/pages/Tasks.jsx)**, **[Setup.jsx](frontend/src/pages/Setup.jsx)**, **[Settings.jsx](frontend/src/pages/Settings.jsx)** — CRUD pages
- **[styles/global.css](frontend/src/styles/global.css)** — full design system via CSS custom properties; dark theme, `#7c6fff` purple accent, DM Sans + DM Mono fonts

### Key domain concepts

| Concept | Description |
|---|---|
| `stress_levels` | Cognitive load categories (Leve/Moderado/Pesado) with weight 1–5 |
| `fixed_blocks` | Recurring weekly commitments (class, work) tied to a stress level |
| `habits` | Regular activities with `max_stress_weight` — blocked on high-stress days |
| `tasks` | One-off items with `effort` (low/medium/high), deadline, `allow_split`, `allow_weekend` |
| `day_plans` | Cached daily plan for a date: stress weight + free windows (JSON) |
| `scheduled_slots` | One activity in a window; status: `suggested → confirmed → done/skipped` |

A task auto-completes when total confirmed/done slot minutes ≥ `estimated_minutes`.

`day_of_week` uses 0 = Sunday … 6 = Saturday throughout.
