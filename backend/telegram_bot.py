#!/usr/bin/env python3
"""Bot do Rotina para Telegram com menus interativos."""

import os, sys, json, time, uuid, requests
from datetime import datetime, date, timedelta

# ── Carrega .env ──────────────────────────────────────────────────
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"\''))

TOKEN           = os.environ.get('TELEGRAM_BOT_TOKEN', '')
ALLOWED_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '')
BASE            = f'https://api.telegram.org/bot{TOKEN}'

from database import get_db
from scheduler import generate_suggestions

# ── Lookup tables ─────────────────────────────────────────────────
DAY_NAMES    = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
STRESS_LABEL = {0:'⚪ Neutro',1:'🟢 Leve',2:'🟢 Leve',
                3:'🟡 Moderado',4:'🔴 Pesado',5:'🔴 Pesado'}
EFFORT_ICON  = {'low':'🟢','medium':'🟡','high':'🔴'}
EFFORT_NAME  = {'low':'Leve','medium':'Médio','high':'Intenso'}

# ── Estado das conversas (em memória) ─────────────────────────────
STATES = {}   # chat_id -> {'step': str, ...dados}

def st_set(chat_id, step, **data):
    STATES[chat_id] = {'step': step, **data}

def st_get(chat_id):
    return STATES.get(chat_id, {})

def st_clear(chat_id):
    STATES.pop(chat_id, None)

# ── Telegram helpers ──────────────────────────────────────────────

def tg(method, **kw):
    try:
        r = requests.post(f'{BASE}/{method}', json=kw, timeout=10)
        return r.json()
    except Exception as e:
        print(f'[tg] {e}')
        return {}

def send(chat_id, text):
    return tg('sendMessage', chat_id=chat_id, text=text,
               parse_mode='Markdown', disable_web_page_preview=True)

def send_kb(chat_id, text, rows):
    """rows: lista de linhas; cada linha é lista de (label, callback_data)"""
    kb = {'inline_keyboard': [[{'text':t,'callback_data':cb} for t,cb in row] for row in rows]}
    return tg('sendMessage', chat_id=chat_id, text=text,
               parse_mode='Markdown', reply_markup=kb)

def edit_kb(chat_id, msg_id, text, rows):
    kb = {'inline_keyboard': [[{'text':t,'callback_data':cb} for t,cb in row] for row in rows]}
    tg('editMessageText', chat_id=chat_id, message_id=msg_id,
       text=text, parse_mode='Markdown', reply_markup=kb)

def answer_cb(cb_id, text=''):
    tg('answerCallbackQuery', callback_query_id=cb_id, text=text)

def get_updates(offset=None):
    params = {'timeout':30, 'allowed_updates':['message','callback_query']}
    if offset: params['offset'] = offset
    try:
        r = requests.get(f'{BASE}/getUpdates', params=params, timeout=35)
        return r.json().get('result', [])
    except Exception:
        return []

# ── Helpers de parsing ────────────────────────────────────────────

def parse_date(s):
    try:
        d = datetime.strptime(s.strip(), '%d/%m')
        r = d.replace(year=date.today().year).strftime('%Y-%m-%d')
        if r < str(date.today()):
            r = d.replace(year=date.today().year+1).strftime('%Y-%m-%d')
        return r
    except ValueError:
        return None

def parse_time(s):
    try:
        datetime.strptime(s.strip(), '%H:%M')
        return s.strip()
    except ValueError:
        return None

# ── Teclados reutilizáveis ────────────────────────────────────────

def effort_kb():
    return [[('🟢 Leve','ef:low'),('🟡 Médio','ef:medium'),('🔴 Intenso','ef:high')]]

def deadline_kb():
    today    = str(date.today())
    tomorrow = str(date.today() + timedelta(1))
    week     = str(date.today() + timedelta(7))
    return [
        [('Hoje',f'dl:{today}'),('Amanhã',f'dl:{tomorrow}'),('Em 1 semana',f'dl:{week}')],
        [('✏️ Digitar (DD/MM)','dl:custom'),('Sem prazo','dl:none')],
    ]

def days_kb(selected):
    sel = list(selected)
    icons = ['✅' if i in sel else '☐' for i in range(7)]
    return [
        [(f"{icons[i]} {DAY_NAMES[i]}", f"day:{i}") for i in range(4)],
        [(f"{icons[i]} {DAY_NAMES[i]}", f"day:{i}") for i in range(4,7)],
        [('📅 Todo dia','days:all'),('💼 Dias úteis','days:work'),('✅ Confirmar','days:ok')],
    ]

def days_text(selected):
    dias = ', '.join(DAY_NAMES[d] for d in sorted(selected)) if selected else 'Nenhum'
    return f"*Selecione os dias do hábito:*\n_{dias}_"

def dur_kb():
    return [
        [('15min','dur:15'),('20min','dur:20'),('30min','dur:30')],
        [('45min','dur:45'),('60min','dur:60'),('90min','dur:90')],
        [('✏️ Outro','dur:custom')],
    ]

def evt_date_kb():
    today    = str(date.today())
    tomorrow = str(date.today()+timedelta(1))
    return [
        [('Hoje',f'evtd:{today}'),('Amanhã',f'evtd:{tomorrow}')],
        [('✏️ Digitar (DD/MM)','evtd:custom'),('Sem data','evtd:none')],
    ]

def blk_day_kb():
    return [
        [(DAY_NAMES[i], f'blkd:{i}') for i in range(4)],
        [(DAY_NAMES[i], f'blkd:{i}') for i in range(4,7)],
    ]

# ── /start e /ajuda ───────────────────────────────────────────────

def cmd_start(chat_id, _):
    send(chat_id, "👋 *Bem-vindo ao Rotina!*\nUse /ajuda para ver todos os comandos.")

def cmd_ajuda(chat_id, _):
    send(chat_id, (
        "*📋 Tarefas*\n"
        "/tarefas · /tarefa · /concluir N · /excluir\\_tarefa N\n\n"
        "*📅 Eventos*\n"
        "/eventos · /evento · /excluir\\_evento N\n\n"
        "*🔁 Hábitos*\n"
        "/habitos · /habito · /excluir\\_habito N\n\n"
        "*🏫 Blocos fixos*\n"
        "/blocos · /bloco · /excluir\\_bloco N\n\n"
        "*☀️ Plano do dia*\n"
        "/hoje"
    ))

# ── TAREFAS ───────────────────────────────────────────────────────

def _get_tasks(conn):
    return conn.execute(
        "SELECT * FROM tasks WHERE is_event=0 AND status!='done' ORDER BY due_date, created_at"
    ).fetchall()

def cmd_tarefas(chat_id, _):
    conn = get_db(); rows = _get_tasks(conn); conn.close()
    if not rows:
        send(chat_id, "✅ Nenhuma tarefa pendente."); return
    lines = ["*📋 Tarefas pendentes:*"]
    for i, t in enumerate(rows, 1):
        ef  = EFFORT_ICON.get(t['effort'],'⚪')
        due = f" · _{t['due_date']}_" if t['due_date'] else ''
        lines.append(f"{i}. {ef} *{t['title']}*{due}")
    send(chat_id, '\n'.join(lines))

def cmd_tarefa(chat_id, args):
    if not args:
        st_set(chat_id, 'task:title')
        send(chat_id, "📋 Qual o *título* da tarefa?")
        return
    st_set(chat_id, 'task:effort', title=args)
    send_kb(chat_id, f"*Nova tarefa:* _{args}_\n\nQual o *esforço cognitivo*?", effort_kb())

def cmd_concluir(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "❌ Use: `/concluir N`"); return
    conn = get_db(); rows = _get_tasks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido."); return
    task = rows[n]
    conn.execute("UPDATE tasks SET status='done' WHERE id=?", (task['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"✅ *{task['title']}* concluída!")

def cmd_excluir_tarefa(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "❌ Use: `/excluir_tarefa N`"); return
    conn = get_db(); rows = _get_tasks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido."); return
    task = rows[n]
    conn.execute("DELETE FROM tasks WHERE id=?", (task['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ *{task['title']}* excluída.")

# ── EVENTOS ───────────────────────────────────────────────────────

def _get_events(conn):
    return conn.execute(
        "SELECT * FROM tasks WHERE is_event=1 AND (event_date IS NULL OR event_date>=?) "
        "ORDER BY event_date, start_time", (str(date.today()),)
    ).fetchall()

def cmd_eventos(chat_id, _):
    conn = get_db(); rows = _get_events(conn); conn.close()
    if not rows:
        send(chat_id, "📅 Nenhum evento próximo."); return
    lines = ["*📅 Próximos eventos:*"]
    for i, e in enumerate(rows, 1):
        t = f" {e['start_time']}–{e['end_time']}" if e['start_time'] and e['end_time'] else \
            (f" {e['start_time']}" if e['start_time'] else '')
        lines.append(f"{i}. *{e['title']}* · _{e['event_date'] or '?'}{t}_")
    send(chat_id, '\n'.join(lines))

def cmd_evento(chat_id, args):
    if not args:
        st_set(chat_id, 'evt:title')
        send(chat_id, "📅 Qual o *nome* do evento?")
        return
    st_set(chat_id, 'evt:date', title=args)
    send_kb(chat_id, f"*Novo evento:* _{args}_\n\nQual a *data*?", evt_date_kb())

def cmd_excluir_evento(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "❌ Use: `/excluir_evento N`"); return
    conn = get_db(); rows = _get_events(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido."); return
    ev = rows[n]
    conn.execute("DELETE FROM tasks WHERE id=?", (ev['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ Evento *{ev['title']}* excluído.")

# ── HÁBITOS ───────────────────────────────────────────────────────

def _get_habits(conn):
    rows = conn.execute("SELECT * FROM habits ORDER BY name").fetchall()
    result = []
    for r in rows:
        d = dict(r); d['days_of_week'] = json.loads(d.get('days_of_week','[]'))
        result.append(d)
    return result

def cmd_habitos(chat_id, _):
    conn = get_db(); rows = _get_habits(conn); conn.close()
    if not rows:
        send(chat_id, "🔁 Nenhum hábito cadastrado."); return
    lines = ["*🔁 Hábitos:*"]
    for i, h in enumerate(rows, 1):
        dias = ', '.join(DAY_NAMES[d] for d in sorted(h['days_of_week'])) or 'todos'
        lines.append(f"{i}. *{h['name']}* · {h['duration_minutes']}min · _{dias}_")
    send(chat_id, '\n'.join(lines))

def cmd_habito(chat_id, args):
    if not args:
        st_set(chat_id, 'hab:name')
        send(chat_id, "🔁 Qual o *nome* do hábito?")
        return
    _ask_hab_days(chat_id, args)

def _ask_hab_days(chat_id, name):
    st_set(chat_id, 'hab:days', name=name, days=[])
    r = send_kb(chat_id, days_text([]), days_kb([]))
    if r.get('ok'):
        STATES[chat_id]['msg_id'] = r['result']['message_id']

def cmd_excluir_habito(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "❌ Use: `/excluir_habito N`"); return
    conn = get_db(); rows = _get_habits(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido."); return
    h = rows[n]
    conn.execute("DELETE FROM habits WHERE id=?", (h['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ Hábito *{h['name']}* excluído.")

# ── BLOCOS FIXOS ──────────────────────────────────────────────────

def _get_blocks(conn):
    return conn.execute(
        "SELECT * FROM fixed_blocks WHERE is_active=1 ORDER BY day_of_week, start_time"
    ).fetchall()

def cmd_blocos(chat_id, _):
    conn = get_db(); rows = _get_blocks(conn); conn.close()
    if not rows:
        send(chat_id, "🏫 Nenhum bloco fixo cadastrado."); return
    lines = ["*🏫 Blocos fixos:*"]
    for i, b in enumerate(rows, 1):
        lines.append(f"{i}. *{b['label']}* · _{DAY_NAMES[b['day_of_week']]} {b['start_time']}–{b['end_time']}_")
    send(chat_id, '\n'.join(lines))

def cmd_bloco(chat_id, args):
    if not args:
        st_set(chat_id, 'blk:name')
        send(chat_id, "🏫 Qual o *nome* do bloco fixo?")
        return
    st_set(chat_id, 'blk:day', name=args)
    send_kb(chat_id, f"*Novo bloco:* _{args}_\n\nQual o *dia da semana*?", blk_day_kb())

def cmd_excluir_bloco(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "❌ Use: `/excluir_bloco N`"); return
    conn = get_db(); rows = _get_blocks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido."); return
    b = rows[n]
    conn.execute("DELETE FROM fixed_blocks WHERE id=?", (b['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ Bloco *{b['label']}* excluído.")

# ── PLANO DO DIA ──────────────────────────────────────────────────

def cmd_hoje(chat_id, _):
    today = str(date.today())
    conn  = get_db()
    try:
        plan, free_windows, day_weight = generate_suggestions(conn, today)
        plan_id = plan['id']

        events = conn.execute(
            "SELECT * FROM tasks WHERE is_event=1 AND event_date=? ORDER BY start_time", (today,)
        ).fetchall()

        confirmed = conn.execute("""
            SELECT ss.*,
                CASE ss.source_type
                    WHEN 'habit' THEN (SELECT name  FROM habits WHERE id=ss.source_id)
                    WHEN 'task'  THEN (SELECT title FROM tasks  WHERE id=ss.source_id)
                END as source_name
            FROM scheduled_slots ss
            WHERE ss.day_plan_id=? AND ss.status IN ('confirmed','done')
            ORDER BY ss.suggested_start
        """, (plan_id,)).fetchall()

        suggested = conn.execute("""
            SELECT ss.*,
                CASE ss.source_type
                    WHEN 'habit' THEN (SELECT name  FROM habits WHERE id=ss.source_id)
                    WHEN 'task'  THEN (SELECT title FROM tasks  WHERE id=ss.source_id)
                END as source_name
            FROM scheduled_slots ss
            WHERE ss.day_plan_id=? AND ss.status='suggested'
            ORDER BY ss.suggested_start
        """, (plan_id,)).fetchall()

        conn.close()
        lines = [f"*☀️ Plano de hoje* ({today})", STRESS_LABEL.get(day_weight,'⚪')]

        if events:
            lines.append("\n*📅 Eventos:*")
            for e in events:
                t = f" {e['start_time']}–{e['end_time']}" if e['start_time'] else ''
                lines.append(f"• *{e['title']}*{t}")

        if confirmed:
            lines.append("\n*✅ Agendadas:*")
            for s in confirmed:
                icon = '✓' if s['status'] == 'done' else '▶'
                lines.append(f"{icon} {s['source_name']} _{s['suggested_start']}–{s['suggested_end']}_")

        if suggested:
            lines.append("\n*💡 Sugestões:*")
            prev = None
            for s in suggested:
                if s['suggested_start'] != prev:
                    lines.append(f"\n_Janela {s['suggested_start']}–{s['suggested_end']}:_")
                    prev = s['suggested_start']
                lines.append(f"  • {s['source_name']}")
        elif not confirmed and not events:
            lines.append("\n_Nenhuma atividade planejada._")

        send(chat_id, '\n'.join(lines))
    except Exception as e:
        conn.close()
        send(chat_id, f"❌ Erro: {e}")

# ── Criadores no banco ────────────────────────────────────────────

def _save_task(chat_id, title, effort, due_date):
    conn = get_db()
    conn.execute(
        "INSERT INTO tasks (id,title,type,effort,estimated_minutes,status,due_date,is_event) "
        "VALUES (?,?,'personal',?,60,'pending',?,0)",
        (str(uuid.uuid4()), title, effort, due_date)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    ef  = f"{EFFORT_ICON[effort]} {EFFORT_NAME[effort]}"
    due = f" · prazo _{due_date}_" if due_date else ''
    send(chat_id, f"✅ Tarefa *{title}* criada! {ef}{due}")

def _save_evento(chat_id, title, event_date, start_time, end_time):
    conn = get_db()
    conn.execute(
        "INSERT INTO tasks (id,title,type,effort,estimated_minutes,status,is_event,event_date,start_time,end_time) "
        "VALUES (?,?,'personal','low',60,'pending',1,?,?,?)",
        (str(uuid.uuid4()), title, event_date, start_time, end_time)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    d = f" em _{event_date}_" if event_date else ''
    h = f" às _{start_time}_" if start_time else ''
    send(chat_id, f"📅 Evento *{title}* criado{d}{h}!")

def _save_habito(chat_id, name, days, duration):
    conn = get_db()
    conn.execute(
        "INSERT INTO habits (id,name,activity_type,duration_minutes,days_of_week,max_stress_weight,is_active) "
        "VALUES (?,?,'personal',?,?,5,1)",
        (str(uuid.uuid4()), name, duration, json.dumps(days))
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    dias = ', '.join(DAY_NAMES[d] for d in sorted(days))
    send(chat_id, f"✅ Hábito *{name}* criado! {duration}min · _{dias}_")

def _save_bloco(chat_id, name, day, start_time, end_time):
    conn = get_db()
    conn.execute(
        "INSERT INTO fixed_blocks (id,label,day_of_week,start_time,end_time,is_active) "
        "VALUES (?,?,?,?,?,1)",
        (str(uuid.uuid4()), name, day, start_time, end_time)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    send(chat_id, f"✅ Bloco *{name}* criado! _{DAY_NAMES[day]} {start_time}–{end_time}_")

# ── Callback query ────────────────────────────────────────────────

def handle_callback(cb):
    chat_id = cb['message']['chat']['id']
    cb_id   = cb['id']
    data    = cb['data']
    st      = st_get(chat_id)
    step    = st.get('step', '')

    answer_cb(cb_id)

    # Esforço da tarefa
    if data.startswith('ef:') and step == 'task:effort':
        effort = data[3:]
        st_set(chat_id, 'task:deadline', title=st['title'], effort=effort)
        ef = f"{EFFORT_ICON[effort]} {EFFORT_NAME[effort]}"
        send_kb(chat_id, f"*{st['title']}* · {ef}\n\nQual o *prazo*?", deadline_kb())

    # Prazo da tarefa
    elif data.startswith('dl:') and step == 'task:deadline':
        val = data[3:]
        if val == 'custom':
            st_set(chat_id, 'task:deadline_text', title=st['title'], effort=st['effort'])
            send(chat_id, "✏️ Digite o prazo no formato *DD/MM*:"); return
        _save_task(chat_id, st['title'], st['effort'],
                   None if val == 'none' else val)

    # Data do evento
    elif data.startswith('evtd:') and step == 'evt:date':
        val = data[5:]
        if val == 'custom':
            st_set(chat_id, 'evt:date_text', title=st['title'])
            send(chat_id, "✏️ Digite a data no formato *DD/MM*:"); return
        event_date = None if val == 'none' else val
        st_set(chat_id, 'evt:start', title=st['title'], event_date=event_date)
        send(chat_id, f"*{st['title']}*\n\nQual o *horário de início*? (HH:MM ou /pular)")

    # Dias do hábito — toggle individual
    elif data.startswith('day:') and step == 'hab:days':
        d   = int(data[4:])
        sel = list(st.get('days', []))
        if d in sel: sel.remove(d)
        else: sel.append(d)
        STATES[chat_id]['days'] = sel
        msg_id = st.get('msg_id')
        if msg_id: edit_kb(chat_id, msg_id, days_text(sel), days_kb(sel))

    # Dias do hábito — atalhos
    elif data in ('days:all', 'days:work') and step == 'hab:days':
        sel = list(range(7)) if data == 'days:all' else [1,2,3,4,5]
        STATES[chat_id]['days'] = sel
        msg_id = st.get('msg_id')
        if msg_id: edit_kb(chat_id, msg_id, days_text(sel), days_kb(sel))

    # Dias do hábito — confirmar
    elif data == 'days:ok' and step == 'hab:days':
        days = st.get('days') or list(range(7))
        st_set(chat_id, 'hab:duration', name=st['name'], days=days)
        dias = ', '.join(DAY_NAMES[d] for d in sorted(days))
        send_kb(chat_id, f"*{st['name']}* · _{dias}_\n\nQual a *duração*?", dur_kb())

    # Duração do hábito
    elif data.startswith('dur:') and step == 'hab:duration':
        val = data[4:]
        if val == 'custom':
            st_set(chat_id, 'hab:dur_text', name=st['name'], days=st['days'])
            send(chat_id, "✏️ Digite a duração em *minutos* (ex: 45):"); return
        _save_habito(chat_id, st['name'], st['days'], int(val))

    # Dia do bloco
    elif data.startswith('blkd:') and step == 'blk:day':
        day = int(data[5:])
        st_set(chat_id, 'blk:start', name=st['name'], day=day)
        send(chat_id, f"*{st['name']}* · {DAY_NAMES[day]}\n\nQual o *horário de início*? (HH:MM)")

# ── Tratamento de texto livre (steps) ────────────────────────────

def handle_text_step(chat_id, text, st):
    step = st['step']

    if step == 'task:title':
        st_set(chat_id, 'task:effort', title=text)
        send_kb(chat_id, f"*Nova tarefa:* _{text}_\n\nQual o *esforço cognitivo*?", effort_kb())

    elif step == 'task:deadline_text':
        d = parse_date(text)
        if not d: send(chat_id, "❌ Formato inválido. Use DD/MM (ex: 15/06):"); return
        _save_task(chat_id, st['title'], st['effort'], d)

    elif step == 'evt:title':
        st_set(chat_id, 'evt:date', title=text)
        send_kb(chat_id, f"*Novo evento:* _{text}_\n\nQual a *data*?", evt_date_kb())

    elif step == 'evt:date_text':
        d = parse_date(text)
        if not d: send(chat_id, "❌ Formato inválido. Use DD/MM:"); return
        st_set(chat_id, 'evt:start', title=st['title'], event_date=d)
        send(chat_id, "Qual o *horário de início*? (HH:MM ou /pular)")

    elif step == 'evt:start':
        t = parse_time(text)
        if not t: send(chat_id, "❌ Formato inválido. Use HH:MM ou /pular:"); return
        st_set(chat_id, 'evt:end', title=st['title'],
               event_date=st.get('event_date'), start_time=t)
        send(chat_id, "Qual o *horário de fim*? (HH:MM ou /pular)")

    elif step == 'evt:end':
        t = parse_time(text)
        if not t: send(chat_id, "❌ Formato inválido. Use HH:MM ou /pular:"); return
        _save_evento(chat_id, st['title'], st.get('event_date'), st.get('start_time'), t)

    elif step == 'hab:name':
        _ask_hab_days(chat_id, text)

    elif step == 'hab:dur_text':
        try:
            dur = int(text.replace('min','').strip())
            _save_habito(chat_id, st['name'], st['days'], dur)
        except ValueError:
            send(chat_id, "❌ Digite apenas o número (ex: 45):")

    elif step == 'blk:name':
        st_set(chat_id, 'blk:day', name=text)
        send_kb(chat_id, f"*Novo bloco:* _{text}_\n\nQual o *dia da semana*?", blk_day_kb())

    elif step == 'blk:start':
        t = parse_time(text)
        if not t: send(chat_id, "❌ Formato inválido. Use HH:MM:"); return
        st_set(chat_id, 'blk:end', name=st['name'], day=st['day'], start_time=t)
        send(chat_id, "Qual o *horário de fim*? (HH:MM)")

    elif step == 'blk:end':
        t = parse_time(text)
        if not t: send(chat_id, "❌ Formato inválido. Use HH:MM:"); return
        _save_bloco(chat_id, st['name'], st['day'], st['start_time'], t)

# ── Roteador de mensagens ─────────────────────────────────────────

COMMANDS = {
    'start':cmd_start, 'ajuda':cmd_ajuda, 'help':cmd_ajuda,
    'tarefas':cmd_tarefas, 'tarefa':cmd_tarefa,
    'concluir':cmd_concluir, 'excluir_tarefa':cmd_excluir_tarefa,
    'eventos':cmd_eventos, 'evento':cmd_evento, 'excluir_evento':cmd_excluir_evento,
    'habitos':cmd_habitos, 'habito':cmd_habito, 'excluir_habito':cmd_excluir_habito,
    'blocos':cmd_blocos, 'bloco':cmd_bloco, 'excluir_bloco':cmd_excluir_bloco,
    'hoje':cmd_hoje,
}

def handle_message(message):
    chat_id = message['chat']['id']
    text    = message.get('text','').strip()

    if ALLOWED_CHAT_ID and str(chat_id) != str(ALLOWED_CHAT_ID):
        send(chat_id, "⛔ Acesso não autorizado."); return

    st = st_get(chat_id)

    # /pular — pula campo opcional (horários de evento)
    if text == '/pular' and st:
        step = st['step']
        if step == 'evt:start':
            st_set(chat_id, 'evt:end', title=st['title'],
                   event_date=st.get('event_date'), start_time=None)
            send(chat_id, "Qual o *horário de fim*? (HH:MM ou /pular)"); return
        if step == 'evt:end':
            _save_evento(chat_id, st['title'], st.get('event_date'), st.get('start_time'), None); return

    # Texto livre durante fluxo ativo
    if st and text and not text.startswith('/'):
        handle_text_step(chat_id, text, st); return

    # Comando
    if text.startswith('/'):
        parts   = text[1:].split(' ', 1)
        command = parts[0].split('@')[0].lower()
        args    = parts[1].strip() if len(parts) > 1 else ''
        st_clear(chat_id)
        handler = COMMANDS.get(command)
        if handler:
            try: handler(chat_id, args)
            except Exception as e: send(chat_id, f"❌ Erro: {e}")
        else:
            send(chat_id, "Comando desconhecido. Use /ajuda.")
    else:
        send(chat_id, "Use /ajuda para ver os comandos disponíveis.")

# ── Main loop ─────────────────────────────────────────────────────

def main():
    if not TOKEN:
        print("ERRO: TELEGRAM_BOT_TOKEN não configurado em backend/.env")
        sys.exit(1)
    print("Bot Rotina iniciado. Aguardando mensagens... (Ctrl+C para parar)")
    offset = None
    while True:
        try:
            updates = get_updates(offset)
            for upd in updates:
                offset = upd['update_id'] + 1
                try:
                    if 'message' in upd:
                        handle_message(upd['message'])
                    elif 'callback_query' in upd:
                        handle_callback(upd['callback_query'])
                except Exception as e:
                    print(f"[handler error] {e}")
            if not updates:
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("\nBot encerrado.")
            break
        except Exception as e:
            print(f"[loop error] {e}")
            time.sleep(5)

if __name__ == '__main__':
    main()
