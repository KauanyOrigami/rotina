const { parseISO, format, addMinutes, isAfter, isBefore, differenceInMinutes } = require('date-fns');

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function computeFreeWindows(fixedBlocks, dayStart = '06:00', dayEnd = '22:00') {
  const blocks = [...fixedBlocks].sort((a,b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const windows = [];
  let cursor = timeToMinutes(dayStart);
  const end = timeToMinutes(dayEnd);

  for (const block of blocks) {
    const bs = timeToMinutes(block.start_time);
    const be = timeToMinutes(block.end_time);
    if (bs > cursor + 30) {
      windows.push({ start: minutesToTime(cursor), end: minutesToTime(bs), available_minutes: bs - cursor });
    }
    cursor = Math.max(cursor, be);
  }

  if (end > cursor + 30) {
    windows.push({ start: minutesToTime(cursor), end: minutesToTime(end), available_minutes: end - cursor });
  }

  return windows;
}

function computeDayStressWeight(fixedBlocks) {
  if (!fixedBlocks.length) return 0;
  const total = fixedBlocks.reduce((sum, b) => sum + (b.stress_weight || 0), 0);
  return Math.min(5, Math.round(total / fixedBlocks.length));
}

function scoreTask(task, today) {
  let score = 0;
  if (task.due_date) {
    const daysLeft = differenceInMinutes(parseISO(task.due_date), today) / (60 * 24);
    if (daysLeft <= 1) score += 100;
    else if (daysLeft <= 3) score += 60;
    else if (daysLeft <= 7) score += 30;
  }
  if (task.effort === 'high') score += 10;
  if (task.effort === 'low') score -= 5;
  return score;
}

function generateSuggestions(db, date) {
  const { v4: uuidv4 } = require('uuid');
  const dayOfWeek = new Date(date).getDay();
  const today = parseISO(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(r => { settings[r.key] = r.value; });
  const weekendEnabled = settings.weekend_enabled === 'true';

  const activeBlocks = db.prepare(`
    SELECT fb.*, sl.weight as stress_weight
    FROM fixed_blocks fb
    LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
    WHERE fb.day_of_week = ? AND fb.is_active = 1
  `).all(dayOfWeek);

  const dayWeight = computeDayStressWeight(activeBlocks);
  const freeWindows = computeFreeWindows(activeBlocks);

  let plan = db.prepare('SELECT * FROM day_plans WHERE date = ?').get(date);
  if (!plan) {
    const planId = uuidv4();
    db.prepare(`INSERT INTO day_plans (id, date, overall_stress_weight, free_windows) VALUES (?,?,?,?)`).run(
      planId, date, dayWeight, JSON.stringify(freeWindows)
    );
    plan = db.prepare('SELECT * FROM day_plans WHERE id = ?').get(planId);
  } else {
    db.prepare('UPDATE day_plans SET overall_stress_weight=?, free_windows=?, generated_at=datetime("now") WHERE id=?')
      .run(dayWeight, JSON.stringify(freeWindows), plan.id);
    db.prepare('DELETE FROM scheduled_slots WHERE day_plan_id=? AND status="suggested"').run(plan.id);
  }

  const slots = [];

  for (const window of freeWindows) {
    let windowCursor = timeToMinutes(window.start);
    const windowEnd = timeToMinutes(window.end);
    const windowMinutes = windowEnd - windowCursor;
    if (windowMinutes < 20) continue;

    const suggestionsForWindow = [];

    // Hábitos que se encaixam
    const habits = db.prepare(`
      SELECT * FROM habits WHERE is_active=1 AND max_stress_weight >= ?
    `).all(dayWeight);

    for (const habit of habits) {
      const days = JSON.parse(habit.days_of_week || '[]');
      if (!days.includes(dayOfWeek)) continue;
      if (habit.duration_minutes > windowMinutes) continue;

      const alreadyScheduled = db.prepare(`
        SELECT COUNT(*) as c FROM scheduled_slots ss
        JOIN day_plans dp ON ss.day_plan_id = dp.id
        WHERE dp.date=? AND ss.source_id=? AND ss.status != 'skipped'
      `).get(date, habit.id);
      if (alreadyScheduled.c > 0) continue;

      const preferredStart = habit.preferred_time ? timeToMinutes(habit.preferred_time) : null;
      const start = preferredStart && preferredStart >= windowCursor && preferredStart + habit.duration_minutes <= windowEnd
        ? preferredStart : windowCursor;

      suggestionsForWindow.push({
        type: 'habit',
        id: habit.id,
        name: habit.name,
        activity_type: habit.activity_type,
        duration: habit.duration_minutes,
        start,
        priority: 80
      });
    }

    // Tarefas pendentes
    const tasks = db.prepare(`
      SELECT * FROM tasks WHERE status IN ('pending','in_progress')
      ORDER BY due_date ASC
    `).all();

    for (const task of tasks) {
      if (isWeekend && !weekendEnabled) continue;
      if (isWeekend && task.allow_weekend === 0) continue;

      const effortWeight = { low: 1, medium: 3, high: 5 }[task.effort] || 3;
      if (effortWeight > 5 - dayWeight + 1) continue;

      const neededMinutes = Math.min(task.estimated_minutes, windowMinutes);
      if (neededMinutes < 20) continue;
      if (neededMinutes > task.estimated_minutes && task.allow_split === 0) continue;

      const alreadyToday = db.prepare(`
        SELECT COALESCE(SUM(
          (strftime('%H','1970-01-01 ' || ss.suggested_end) * 60 + strftime('%M','1970-01-01 ' || ss.suggested_end)) -
          (strftime('%H','1970-01-01 ' || ss.suggested_start) * 60 + strftime('%M','1970-01-01 ' || ss.suggested_start))
        ),0) as total_mins
        FROM scheduled_slots ss
        JOIN day_plans dp ON ss.day_plan_id = dp.id
        WHERE dp.date=? AND ss.source_id=? AND ss.status != 'skipped'
      `).get(date, task.id);

      if (alreadyToday.total_mins >= task.estimated_minutes) continue;

      suggestionsForWindow.push({
        type: 'task',
        id: task.id,
        name: task.title,
        activity_type: task.type,
        duration: neededMinutes,
        start: windowCursor,
        priority: scoreTask(task, today)
      });
    }

    // Top 3 sugestões por prioridade
    const top3 = suggestionsForWindow
      .sort((a,b) => b.priority - a.priority)
      .slice(0, 3);

    for (const s of top3) {
      const slotId = uuidv4();
      const startTime = minutesToTime(s.start);
      const endTime = minutesToTime(s.start + s.duration);
      db.prepare(`
        INSERT INTO scheduled_slots (id, day_plan_id, source_type, source_id, suggested_start, suggested_end, status)
        VALUES (?,?,?,?,?,?,'suggested')
      `).run(slotId, plan.id, s.type, s.id, startTime, endTime);

      slots.push({ id: slotId, window, suggestion: s, startTime, endTime });
    }
  }

  return { plan, freeWindows, dayWeight, slots };
}

module.exports = { generateSuggestions, computeFreeWindows, computeDayStressWeight };
