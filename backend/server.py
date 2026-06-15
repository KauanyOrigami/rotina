from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import json
import uuid
from datetime import datetime, timedelta
from database import get_db, init_db, migrate_db
from scheduler import generate_suggestions
from ms_auth import (
    is_configured, get_auth_url, handle_callback,
    get_access_token, get_connection_info, disconnect,
    import_calendar_events, FRONTEND_URL,
)

app = Flask(__name__)

CORS(app, origins=[
    "https://rotina-plum.vercel.app",
    "http://localhost:3000"
])

init_db()
migrate_db()

def rows_to_list(rows):
    return [dict(r) for r in rows]

# ── Stress Levels ──────────────────────────────────────────
@app.route('/api/stress-levels', methods=['GET'])
def get_stress_levels():
    conn = get_db()
    rows = conn.execute('SELECT * FROM stress_levels ORDER BY weight').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d['allowed_activity_types'] = json.loads(d['allowed_activity_types'])
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/stress-levels', methods=['POST'])
def create_stress_level():
    data = request.json
    id_ = str(uuid.uuid4())
    conn = get_db()
    conn.execute('INSERT INTO stress_levels (id,label,weight,allowed_activity_types,color) VALUES (?,?,?,?,?)',
                 (id_, data['label'], data['weight'], json.dumps(data.get('allowed_activity_types', [])), data.get('color','#888888')))
    conn.commit(); conn.close()
    return jsonify({'id': id_})

@app.route('/api/stress-levels/<id_>', methods=['PUT'])
def update_stress_level(id_):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE stress_levels SET label=?,weight=?,allowed_activity_types=?,color=? WHERE id=?',
                 (data['label'], data['weight'], json.dumps(data.get('allowed_activity_types',[])), data.get('color','#888888'), id_))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/stress-levels/<id_>', methods=['DELETE'])
def delete_stress_level(id_):
    conn = get_db()
    conn.execute('DELETE FROM stress_levels WHERE id=?', (id_,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Fixed Blocks ───────────────────────────────────────────
@app.route('/api/fixed-blocks', methods=['GET'])
def get_fixed_blocks():
    conn = get_db()
    rows = conn.execute("""
        SELECT fb.*, sl.label as stress_label, sl.weight as stress_weight, sl.color as stress_color
        FROM fixed_blocks fb
        LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
        ORDER BY fb.day_of_week, fb.start_time
    """).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))

@app.route('/api/fixed-blocks', methods=['POST'])
def create_fixed_block():
    data = request.json
    id_ = str(uuid.uuid4())
    conn = get_db()
    conn.execute('INSERT INTO fixed_blocks (id,label,day_of_week,start_time,end_time,stress_level_id) VALUES (?,?,?,?,?,?)',
                 (id_, data['label'], data['day_of_week'], data['start_time'], data['end_time'], data.get('stress_level_id')))
    conn.commit(); conn.close()
    return jsonify({'id': id_})

@app.route('/api/fixed-blocks/<id_>', methods=['PUT'])
def update_fixed_block(id_):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE fixed_blocks SET label=?,day_of_week=?,start_time=?,end_time=?,stress_level_id=?,is_active=? WHERE id=?',
                 (data['label'], data['day_of_week'], data['start_time'], data['end_time'],
                  data.get('stress_level_id'), data.get('is_active',1), id_))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/fixed-blocks/<id_>', methods=['DELETE'])
def delete_fixed_block(id_):
    conn = get_db()
    conn.execute('DELETE FROM fixed_blocks WHERE id=?', (id_,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Habits ─────────────────────────────────────────────────
@app.route('/api/habits', methods=['GET'])
def get_habits():
    conn = get_db()
    rows = conn.execute('SELECT * FROM habits ORDER BY name').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d['days_of_week'] = json.loads(d['days_of_week'])
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/habits', methods=['POST'])
def create_habit():
    data = request.json
    id_ = str(uuid.uuid4())
    conn = get_db()
    conn.execute('INSERT INTO habits (id,name,activity_type,duration_minutes,preferred_time,days_of_week,max_stress_weight) VALUES (?,?,?,?,?,?,?)',
                 (id_, data['name'], data['activity_type'], data['duration_minutes'],
                  data.get('preferred_time'), json.dumps(data.get('days_of_week',[])), data.get('max_stress_weight',5)))
    conn.commit(); conn.close()
    return jsonify({'id': id_})

@app.route('/api/habits/<id_>', methods=['PUT'])
def update_habit(id_):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE habits SET name=?,activity_type=?,duration_minutes=?,preferred_time=?,days_of_week=?,max_stress_weight=?,is_active=? WHERE id=?',
                 (data['name'], data['activity_type'], data['duration_minutes'],
                  data.get('preferred_time'), json.dumps(data.get('days_of_week',[])),
                  data.get('max_stress_weight',5), data.get('is_active',1), id_))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/habits/<id_>', methods=['DELETE'])
def delete_habit(id_):
    conn = get_db()
    conn.execute('DELETE FROM habits WHERE id=?', (id_,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Tags ───────────────────────────────────────────────────
@app.route('/api/tags', methods=['GET'])
def get_tags():
    conn = get_db()
    rows = conn.execute('SELECT * FROM tags ORDER BY name').fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))

@app.route('/api/tags', methods=['POST'])
def create_tag():
    data = request.json
    id_ = str(uuid.uuid4())
    conn = get_db()
    try:
        conn.execute('INSERT INTO tags (id,name,color) VALUES (?,?,?)',
                     (id_, data['name'].strip(), data.get('color', '#7c6fff')))
        conn.commit(); conn.close()
        return jsonify({'id': id_})
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400

@app.route('/api/tags/<id_>', methods=['PUT'])
def update_tag(id_):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE tags SET name=?,color=? WHERE id=?',
                 (data['name'].strip(), data.get('color', '#7c6fff'), id_))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/tags/<id_>', methods=['DELETE'])
def delete_tag(id_):
    conn = get_db()
    conn.execute('DELETE FROM tags WHERE id=?', (id_,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Tasks ──────────────────────────────────────────────────
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    status = request.args.get('status')
    conn = get_db()
    base = '''
        SELECT t.*, tg.name as tag_name, tg.color as tag_color
        FROM tasks t
        LEFT JOIN tags tg ON t.tag_id = tg.id
    '''
    if status:
        rows = conn.execute(base + ' WHERE t.status=? ORDER BY t.due_date ASC, t.created_at ASC', (status,)).fetchall()
    else:
        rows = conn.execute(base + ' ORDER BY t.due_date ASC, t.created_at ASC').fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    id_ = str(uuid.uuid4())
    conn = get_db()
    conn.execute(
        'INSERT INTO tasks (id,title,type,effort,estimated_minutes,due_date,allow_split,allow_weekend,notes,is_event,event_date,start_time,end_time,tag_id) '
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        (id_, data['title'], data.get('type', 'personal'), data.get('effort', 'medium'),
         data.get('estimated_minutes', 60), data.get('due_date'),
         1 if data.get('allow_split') else 0,
         1 if data.get('allow_weekend') else 0,
         data.get('notes'),
         1 if data.get('is_event') else 0,
         data.get('event_date'), data.get('start_time'), data.get('end_time'),
         data.get('tag_id')))
    conn.commit(); conn.close()
    return jsonify({'id': id_})

@app.route('/api/tasks/<id_>', methods=['PUT'])
def update_task(id_):
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE tasks SET title=?,type=?,effort=?,estimated_minutes=?,due_date=?,allow_split=?,allow_weekend=?,status=?,notes=?,is_event=?,event_date=?,start_time=?,end_time=?,tag_id=? WHERE id=?',
        (data['title'], data.get('type', 'personal'), data.get('effort', 'medium'),
         data.get('estimated_minutes', 60), data.get('due_date'),
         1 if data.get('allow_split') else 0,
         1 if data.get('allow_weekend') else 0,
         data.get('status', 'pending'), data.get('notes'),
         1 if data.get('is_event') else 0,
         data.get('event_date'), data.get('start_time'), data.get('end_time'),
         data.get('tag_id'), id_))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/tasks/<id_>', methods=['DELETE'])
def delete_task(id_):
    conn = get_db()
    conn.execute('DELETE FROM tasks WHERE id=?', (id_,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Day Plans ──────────────────────────────────────────────
@app.route('/api/day-plan/<date_str>', methods=['GET'])
def get_day_plan(date_str):
    conn = get_db()
    plan, free_windows, day_weight = generate_suggestions(conn, date_str)

    slots = conn.execute("""
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
    """, (plan['id'],)).fetchall()

    conn.close()
    return jsonify({
        'plan': {**plan, 'free_windows': json.loads(plan['free_windows'])},
        'slots': rows_to_list(slots),
        'dayWeight': day_weight,
        'freeWindows': free_windows
    })

@app.route('/api/week-plan', methods=['GET'])
def get_week_plan():
    start = request.args.get('start')
    if not start:
        return jsonify({'error': 'start required'}), 400

    conn = get_db()
    results = []
    start_date = datetime.strptime(start, '%Y-%m-%d').date()

    for i in range(7):
        d = start_date + timedelta(days=i)
        date_str = d.strftime('%Y-%m-%d')
        js_day = (d.weekday() + 1) % 7

        fixed_blocks = conn.execute("""
            SELECT fb.*, sl.weight as stress_weight, sl.label as stress_label, sl.color as stress_color
            FROM fixed_blocks fb
            LEFT JOIN stress_levels sl ON fb.stress_level_id = sl.id
            WHERE fb.day_of_week=? AND fb.is_active=1
        """, (js_day,)).fetchall()

        plan = conn.execute('SELECT * FROM day_plans WHERE date=?', (date_str,)).fetchone()
        slots = []
        if plan:
            slots = conn.execute("""
                SELECT ss.*,
                    CASE ss.source_type
                        WHEN 'habit' THEN (SELECT name FROM habits WHERE id=ss.source_id)
                        WHEN 'task'  THEN (SELECT title FROM tasks WHERE id=ss.source_id)
                    END as source_name
                FROM scheduled_slots ss WHERE ss.day_plan_id=? ORDER BY ss.suggested_start
            """, (plan['id'],)).fetchall()

        results.append({
            'date': date_str,
            'dayOfWeek': js_day,
            'fixedBlocks': rows_to_list(fixed_blocks),
            'plan': dict(plan) if plan else None,
            'slots': rows_to_list(slots)
        })

    conn.close()
    return jsonify(results)

@app.route('/api/slots/<id_>/status', methods=['PATCH'])
def update_slot_status(id_):
    data = request.json
    status = data['status']
    conn = get_db()
    conn.execute('UPDATE scheduled_slots SET status=? WHERE id=?', (status, id_))

    if status == 'done':
        slot = conn.execute('SELECT * FROM scheduled_slots WHERE id=?', (id_,)).fetchone()
        if slot and slot['source_type'] == 'task':
            def t2m(t):
                h, m = map(int, t.split(':'))
                return h * 60 + m
            done_slots = conn.execute(
                "SELECT suggested_start, suggested_end FROM scheduled_slots WHERE source_id=? AND status='done'",
                (slot['source_id'],)
            ).fetchall()
            done_mins = sum(t2m(s['suggested_end']) - t2m(s['suggested_start']) for s in done_slots)
            task = conn.execute('SELECT * FROM tasks WHERE id=?', (slot['source_id'],)).fetchone()
            if task and done_mins >= task['estimated_minutes']:
                conn.execute("UPDATE tasks SET status='done' WHERE id=?", (slot['source_id'],))

    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Settings ───────────────────────────────────────────────
@app.route('/api/settings', methods=['GET'])
def get_settings():
    conn = get_db()
    rows = conn.execute('SELECT * FROM settings').fetchall()
    conn.close()
    return jsonify({r['key']: r['value'] for r in rows})

@app.route('/api/settings', methods=['PATCH'])
def update_settings():
    data = request.json
    conn = get_db()
    for key, value in data.items():
        conn.execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', (key, str(value)))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

# ── Microsoft 365 ─────────────────────────────────────────────────
@app.route('/api/ms/auth-url', methods=['GET'])
def ms_auth_url():
    if not is_configured():
        return jsonify({'error': 'MS_CLIENT_ID e MS_CLIENT_SECRET não configurados'}), 400
    return jsonify({'url': get_auth_url()})

@app.route('/api/ms/callback', methods=['GET'])
def ms_callback():
    code  = request.args.get('code')
    error = request.args.get('error')
    if error or not code:
        return redirect(f'{FRONTEND_URL}/settings?ms=error')
    conn = get_db()
    try:
        handle_callback(code, conn)
        conn.close()
        return redirect(f'{FRONTEND_URL}/settings?ms=connected')
    except Exception:
        conn.close()
        return redirect(f'{FRONTEND_URL}/settings?ms=error')

@app.route('/api/ms/status', methods=['GET'])
def ms_status():
    conn  = get_db()
    token = get_access_token(conn)
    if not token:
        conn.close()
        return jsonify({'connected': False})
    info = get_connection_info(conn)
    conn.close()
    return jsonify({'connected': True, **info})

@app.route('/api/ms/disconnect', methods=['DELETE'])
def ms_disconnect():
    conn = get_db()
    disconnect(conn)
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/ms/import', methods=['POST'])
def ms_import():
    data = request.json or {}
    days = max(1, min(90, int(data.get('days', 30))))
    conn = get_db()
    try:
        result = import_calendar_events(conn, days)
        conn.close()
        return jsonify(result)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400

# ── Telegram status ───────────────────────────────────────────────
@app.route('/api/telegram/status', methods=['GET'])
def telegram_status():
    import os as _os
    configured = bool(_os.environ.get('TELEGRAM_BOT_TOKEN'))
    return jsonify({'configured': configured})

import os as _os
_TELEGRAM_TOKEN = _os.environ.get('TELEGRAM_BOT_TOKEN', '')

if _TELEGRAM_TOKEN:
    import telegram_bot as _bot  # type: ignore

    @app.route(f'/telegram/{_TELEGRAM_TOKEN}', methods=['POST'])
    def telegram_webhook():
        data = request.get_json(force=True) or {}
        try:
            if 'message' in data:
                _bot.handle_message(data['message'])
            elif 'callback_query' in data:
                _bot.handle_callback(data['callback_query'])
        except Exception as e:
            print(f'[webhook] {e}')
        return 'ok', 200

if __name__ == '__main__':
    app.run(port=3001, debug=False)
