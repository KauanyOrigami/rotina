const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { generateSuggestions } = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());

// ── Stress Levels ──────────────────────────────────────────
app.get('/api/stress-levels', (req, res) => {
  const rows = db.prepare('SELECT * FROM stress_levels ORDER BY weight').all();
  res.json(rows.map(r => ({ ...r, allowed_activity_types: JSON.parse(r.allowed_activity_types) })));
});

app.post('/api/stress-levels', (req, res) => {
  const { label, weight, allowed_activity_types, color } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO stress_levels (id,label,weight,allowed_activity_types,color) VALUES (?,?,?,?,?)')
    .run(id, label, weight, JSON.stringify(allowed_activity_types || []), color || '#888888');
  res.json({ id });
});

app.put('/api/stress-levels/:id', (req, res) => {
  const { label, weight, allowed_activity_types, color } = req.body;
  db.prepare('UPDATE stress_levels SET label=?,weight=?,allowed_activity_types=?,color=? WHERE id=?')
    .run(label, weight, JSON.stringify(allowed_activity_types || []), color, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/stress-levels/:id', (req, res) => {
  db.prepare('DELETE FROM stress_levels WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Fixed Blocks ───────────────────────────────────────────
app.get('/api/fixed-blocks', (req, res) => {
  const rows = db.prepare(`
    SELECT fb.*, sl.label as stress_label, sl.weight as stress_weight, sl.color as stress_color
    FROM fixed_blocks fb
    LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
    ORDER BY fb.day_of_week, fb.start_time
  `).all();
  res.json(rows);
});

app.post('/api/fixed-blocks', (req, res) => {
  const { label, day_of_week, start_time, end_time, stress_level_id } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO fixed_blocks (id,label,day_of_week,start_time,end_time,stress_level_id) VALUES (?,?,?,?,?,?)')
    .run(id, label, day_of_week, start_time, end_time, stress_level_id || null);
  res.json({ id });
});

app.put('/api/fixed-blocks/:id', (req, res) => {
  const { label, day_of_week, start_time, end_time, stress_level_id, is_active } = req.body;
  db.prepare('UPDATE fixed_blocks SET label=?,day_of_week=?,start_time=?,end_time=?,stress_level_id=?,is_active=? WHERE id=?')
    .run(label, day_of_week, start_time, end_time, stress_level_id || null, is_active ?? 1, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/fixed-blocks/:id', (req, res) => {
  db.prepare('DELETE FROM fixed_blocks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Habits ─────────────────────────────────────────────────
app.get('/api/habits', (req, res) => {
  const rows = db.prepare('SELECT * FROM habits ORDER BY name').all();
  res.json(rows.map(r => ({ ...r, days_of_week: JSON.parse(r.days_of_week) })));
});

app.post('/api/habits', (req, res) => {
  const { name, activity_type, duration_minutes, preferred_time, days_of_week, max_stress_weight } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO habits (id,name,activity_type,duration_minutes,preferred_time,days_of_week,max_stress_weight) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, activity_type, duration_minutes, preferred_time || null, JSON.stringify(days_of_week || []), max_stress_weight || 5);
  res.json({ id });
});

app.put('/api/habits/:id', (req, res) => {
  const { name, activity_type, duration_minutes, preferred_time, days_of_week, max_stress_weight, is_active } = req.body;
  db.prepare('UPDATE habits SET name=?,activity_type=?,duration_minutes=?,preferred_time=?,days_of_week=?,max_stress_weight=?,is_active=? WHERE id=?')
    .run(name, activity_type, duration_minutes, preferred_time || null, JSON.stringify(days_of_week || []), max_stress_weight || 5, is_active ?? 1, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/habits/:id', (req, res) => {
  db.prepare('DELETE FROM habits WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Tasks ──────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const { status, week_start } = req.query;
  let query = 'SELECT * FROM tasks';
  const params = [];
  const conditions = [];
  if (status) { conditions.push('status=?'); params.push(status); }
  if (week_start) {
    conditions.push("due_date >= ? AND due_date <= date(?, '+6 days')");
    params.push(week_start, week_start);
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY due_date ASC, created_at ASC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/tasks', (req, res) => {
  const { title, type, effort, estimated_minutes, due_date, allow_split, allow_weekend, notes } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO tasks (id,title,type,effort,estimated_minutes,due_date,allow_split,allow_weekend,notes) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, title, type || 'personal', effort || 'medium', estimated_minutes || 60, due_date || null, allow_split ? 1 : 0, allow_weekend ? 1 : 0, notes || null);
  res.json({ id });
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, type, effort, estimated_minutes, due_date, allow_split, allow_weekend, status, notes } = req.body;
  db.prepare('UPDATE tasks SET title=?,type=?,effort=?,estimated_minutes=?,due_date=?,allow_split=?,allow_weekend=?,status=?,notes=? WHERE id=?')
    .run(title, type, effort, estimated_minutes, due_date || null, allow_split ? 1 : 0, allow_weekend ? 1 : 0, status, notes || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Day Plans & Scheduling ─────────────────────────────────
app.get('/api/day-plan/:date', (req, res) => {
  const { date } = req.params;
  const result = generateSuggestions(db, date);

  const slots = db.prepare(`
    SELECT ss.*,
      CASE ss.source_type
        WHEN 'habit' THEN (SELECT name FROM habits WHERE id=ss.source_id)
        WHEN 'task'  THEN (SELECT title FROM tasks WHERE id=ss.source_id)
      END as source_name,
      CASE ss.source_type
        WHEN 'habit' THEN (SELECT activity_type FROM habits WHERE id=ss.source_id)
        WHEN 'task'  THEN (SELECT type FROM tasks WHERE id=ss.source_id)
      END as activity_type,
      CASE ss.source_type
        WHEN 'task' THEN (SELECT effort FROM tasks WHERE id=ss.source_id)
        ELSE NULL
      END as effort
    FROM scheduled_slots ss
    WHERE ss.day_plan_id=?
    ORDER BY ss.suggested_start
  `).all(result.plan.id);

  res.json({
    plan: { ...result.plan, free_windows: JSON.parse(result.plan.free_windows) },
    slots,
    dayWeight: result.dayWeight,
    freeWindows: result.freeWindows
  });
});

app.get('/api/week-plan', (req, res) => {
  const { start } = req.query;
  if (!start) return res.status(400).json({ error: 'start required' });

  const results = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split('T')[0];
    const plan = db.prepare('SELECT * FROM day_plans WHERE date=?').get(date);
    const fixedBlocks = db.prepare(`
      SELECT fb.*, sl.weight as stress_weight, sl.label as stress_label, sl.color as stress_color
      FROM fixed_blocks fb
      LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
      WHERE fb.day_of_week=? AND fb.is_active=1
    `).all(d.getDay());

    const slots = plan ? db.prepare(`
      SELECT ss.*,
        CASE ss.source_type
          WHEN 'habit' THEN (SELECT name FROM habits WHERE id=ss.source_id)
          WHEN 'task'  THEN (SELECT title FROM tasks WHERE id=ss.source_id)
        END as source_name
      FROM scheduled_slots ss WHERE ss.day_plan_id=? ORDER BY ss.suggested_start
    `).all(plan.id) : [];

    results.push({ date, dayOfWeek: d.getDay(), fixedBlocks, plan, slots });
  }
  res.json(results);
});

app.patch('/api/slots/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE scheduled_slots SET status=? WHERE id=?').run(status, req.params.id);
  if (status === 'done') {
    const slot = db.prepare('SELECT * FROM scheduled_slots WHERE id=?').get(req.params.id);
    if (slot && slot.source_type === 'task') {
      const remaining = db.prepare(`
        SELECT COALESCE(SUM(
          (strftime('%H', '1970-01-01 ' || suggested_end)*60 + strftime('%M','1970-01-01 ' || suggested_end)) -
          (strftime('%H','1970-01-01 ' || suggested_start)*60 + strftime('%M','1970-01-01 ' || suggested_start))
        ),0) as done_mins
        FROM scheduled_slots WHERE source_id=? AND status='done'
      `).get(slot.source_id);
      const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(slot.source_id);
      if (task && remaining.done_mins >= task.estimated_minutes) {
        db.prepare("UPDATE tasks SET status='done' WHERE id=?").run(slot.source_id);
      }
    }
  }
  res.json({ ok: true });
});

// ── Settings ───────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  res.json(s);
});

app.patch('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(key, String(value));
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Rotina API rodando na porta ${PORT}`));
