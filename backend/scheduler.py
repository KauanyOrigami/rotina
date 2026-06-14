import json
import uuid
from datetime import date as date_type, datetime, timedelta

def time_to_minutes(t):
    h, m = map(int, t.split(':'))
    return h * 60 + m

def minutes_to_time(m):
    return f"{m // 60:02d}:{m % 60:02d}"

def compute_free_windows(fixed_blocks, day_start='06:00', day_end='22:00'):
    blocks = sorted(fixed_blocks, key=lambda b: time_to_minutes(b['start_time']))
    windows = []
    cursor = time_to_minutes(day_start)
    end = time_to_minutes(day_end)

    for block in blocks:
        bs = time_to_minutes(block['start_time'])
        be = time_to_minutes(block['end_time'])
        if bs > cursor + 30:
            windows.append({
                'start': minutes_to_time(cursor),
                'end': minutes_to_time(bs),
                'available_minutes': bs - cursor
            })
        cursor = max(cursor, be)

    if end > cursor + 30:
        windows.append({
            'start': minutes_to_time(cursor),
            'end': minutes_to_time(end),
            'available_minutes': end - cursor
        })

    return windows

def compute_day_stress_weight(fixed_blocks):
    if not fixed_blocks:
        return 0
    total = sum(b.get('stress_weight', 0) for b in fixed_blocks)
    return min(5, round(total / len(fixed_blocks)))

def score_task(task, today):
    score = 0
    if task.get('due_date'):
        try:
            due = datetime.strptime(task['due_date'], '%Y-%m-%d').date()
            days_left = (due - today).days
            if days_left <= 1: score += 100
            elif days_left <= 3: score += 60
            elif days_left <= 7: score += 30
        except:
            pass
    effort_bonus = {'high': 10, 'medium': 0, 'low': -5}
    score += effort_bonus.get(task.get('effort', 'medium'), 0)
    return score

def generate_suggestions(conn, date_str):
    c = conn.cursor()
    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    day_of_week = date_obj.weekday()  # 0=Mon, 6=Sun
    # Convert to JS convention: 0=Sun, 6=Sat
    js_day = (day_of_week + 1) % 7
    is_weekend = js_day == 0 or js_day == 6

    settings = {r['key']: r['value'] for r in c.execute("SELECT key, value FROM settings").fetchall()}
    weekend_enabled = settings.get('weekend_enabled', 'false') == 'true'

    active_blocks = c.execute("""
        SELECT fb.*, sl.weight as stress_weight, sl.label as stress_label, sl.color as stress_color
        FROM fixed_blocks fb
        LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
        WHERE fb.day_of_week = ? AND fb.is_active = 1
    """, (js_day,)).fetchall()
    active_blocks = [dict(r) for r in active_blocks]

    day_weight = compute_day_stress_weight(active_blocks)
    free_windows = compute_free_windows(active_blocks)

    plan = c.execute("SELECT * FROM day_plans WHERE date = ?", (date_str,)).fetchone()
    if not plan:
        plan_id = str(uuid.uuid4())
        c.execute("INSERT INTO day_plans (id, date, overall_stress_weight, free_windows) VALUES (?,?,?,?)",
                  (plan_id, date_str, day_weight, json.dumps(free_windows)))
        plan = c.execute("SELECT * FROM day_plans WHERE id = ?", (plan_id,)).fetchone()
    else:
        plan_id = plan['id']
        c.execute("UPDATE day_plans SET overall_stress_weight=?, free_windows=?, generated_at=datetime('now') WHERE id=?",
                  (day_weight, json.dumps(free_windows), plan_id))
        c.execute("DELETE FROM scheduled_slots WHERE day_plan_id=? AND status='suggested'", (plan_id,))

    plan = dict(plan)

    for window in free_windows:
        window_cursor = time_to_minutes(window['start'])
        window_end = time_to_minutes(window['end'])
        window_minutes = window_end - window_cursor
        if window_minutes < 20:
            continue

        suggestions = []

        # Habits
        habits = c.execute("SELECT * FROM habits WHERE is_active=1 AND max_stress_weight >= ?", (day_weight,)).fetchall()
        for habit in habits:
            habit = dict(habit)
            days = json.loads(habit.get('days_of_week', '[]'))
            if js_day not in days:
                continue
            if habit['duration_minutes'] > window_minutes:
                continue
            already = c.execute("""
                SELECT COUNT(*) as cnt FROM scheduled_slots ss
                JOIN day_plans dp ON ss.day_plan_id = dp.id
                WHERE dp.date=? AND ss.source_id=? AND ss.status != 'skipped'
            """, (date_str, habit['id'])).fetchone()['cnt']
            if already > 0:
                continue

            preferred = habit.get('preferred_time')
            if preferred:
                ps = time_to_minutes(preferred)
                start = ps if (ps >= window_cursor and ps + habit['duration_minutes'] <= window_end) else window_cursor
            else:
                start = window_cursor

            suggestions.append({
                'type': 'habit',
                'id': habit['id'],
                'name': habit['name'],
                'activity_type': habit['activity_type'],
                'duration': habit['duration_minutes'],
                'start': start,
                'priority': 80
            })

        # Tasks
        tasks = c.execute("""
            SELECT * FROM tasks WHERE status IN ('pending','in_progress')
            ORDER BY due_date ASC
        """).fetchall()
        for task in tasks:
            task = dict(task)
            if is_weekend and not weekend_enabled:
                continue
            if is_weekend and not task.get('allow_weekend'):
                continue

            effort_weight = {'low': 1, 'medium': 3, 'high': 5}.get(task.get('effort', 'medium'), 3)
            if effort_weight > 5 - day_weight + 1:
                continue

            needed = min(task['estimated_minutes'], window_minutes)
            if needed < 20:
                continue
            if needed < task['estimated_minutes'] and not task.get('allow_split'):
                continue

            suggestions.append({
                'type': 'task',
                'id': task['id'],
                'name': task['title'],
                'activity_type': task['type'],
                'duration': needed,
                'start': window_cursor,
                'priority': score_task(task, date_obj)
            })

        top3 = sorted(suggestions, key=lambda x: -x['priority'])[:3]
        for s in top3:
            slot_id = str(uuid.uuid4())
            start_time = minutes_to_time(s['start'])
            end_time = minutes_to_time(s['start'] + s['duration'])
            c.execute("""
                INSERT INTO scheduled_slots (id, day_plan_id, source_type, source_id, suggested_start, suggested_end, status)
                VALUES (?,?,?,?,?,?,'suggested')
            """, (slot_id, plan_id, s['type'], s['id'], start_time, end_time))

    conn.commit()
    return plan, free_windows, day_weight
