#!/usr/bin/env python3
"""Bot do Rotina para Telegram com menus interativos."""

import os, sys, json, time, uuid, re, requests
from datetime import datetime, date, timedelta

TAG_PATTERN = re.compile(r'\["([^"]+)"\]')

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

# ── Constantes de formatação ───────────────────────────────────────
SEP          = '─────────────────'
DAY_NAMES    = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
DAY_FULL     = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
MONTH_NAMES  = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
STRESS_LABEL = {0:'⚪️ Nenhuma',1:'🟢 Leve',2:'🟢 Leve',
                3:'🟡 Moderada',4:'🔴 Pesada',5:'🔴 Pesada'}
EFFORT_ICON  = {'low':'🟢','medium':'🟡','high':'🔴'}
EFFORT_NAME  = {'low':'Leve','medium':'Médio','high':'Intenso'}

_PROXIES = {
    'http':  'http://proxy.server:3128',
    'https': 'http://proxy.server:3128',
}
# ── Helpers de formatação ─────────────────────────────────────────

def hdr(emoji, title, subtitle=None):
    """Cabeçalho padronizado com separador."""
    parts = [f"{emoji} *{title}*"]
    if subtitle:
        parts.append(f"_{subtitle}_")
    parts.append(SEP)
    return '\n'.join(parts)

def fmt_date(s):
    """YYYY-MM-DD → DD/MM"""
    if not s: return None
    try: return datetime.strptime(s, '%Y-%m-%d').strftime('%d/%m')
    except: return s

def fmt_effort(ef):
    return f"{EFFORT_ICON.get(ef,'⚪')} {EFFORT_NAME.get(ef,ef)}"

def fmt_days(days_list):
    if not days_list: return 'nenhum'
    return '  '.join(DAY_NAMES[d] for d in sorted(days_list))

def task_context(title=None, effort=None, due=None, tag_name=None):
    """Card de progresso exibido durante criação de tarefa."""
    lines = []
    if title:    lines.append(f"📌 *{title}*")
    if tag_name: lines.append(f"🏷 _{tag_name}_")
    if effort:   lines.append(f"⚡ {fmt_effort(effort)}")
    if due:      lines.append(f"📅 Prazo: {fmt_date(due) or due}")
    if lines:
        return '\n'.join(lines) + f'\n{SEP}\n'
    return ''

def evt_context(title=None, event_date=None, start_time=None, tag_name=None):
    lines = []
    if title:       lines.append(f"📌 *{title}*")
    if tag_name:    lines.append(f"🏷 _{tag_name}_")
    if event_date:  lines.append(f"📅 {fmt_date(event_date) or event_date}")
    if start_time:  lines.append(f"⏰ Início: {start_time}")
    if lines:
        return '\n'.join(lines) + f'\n{SEP}\n'
    return ''

def blk_context(name=None, day=None, start_time=None):
    lines = []
    if name:       lines.append(f"📌 *{name}*")
    if day is not None: lines.append(f"📆 {DAY_FULL[day]}")
    if start_time: lines.append(f"⏰ Início: {start_time}")
    if lines:
        return '\n'.join(lines) + f'\n{SEP}\n'
    return ''

# ── Estado das conversas (em memória) ─────────────────────────────
STATES = {}

def st_set(chat_id, step, **data):
    STATES[chat_id] = {'step': step, **data}

def st_get(chat_id):
    return STATES.get(chat_id, {})

def st_clear(chat_id):
    STATES.pop(chat_id, None)

# ── Telegram helpers ──────────────────────────────────────────────



def tg(method, **kw):
    try:
        r = requests.post(f'{BASE}/{method}', json=kw, timeout=10, proxies=_PROXIES)
        return r.json()
    except Exception as e:
        print(f'[tg] {e}')
        return {}


def send(chat_id, text):
    return tg('sendMessage', chat_id=chat_id, text=text,
               parse_mode='Markdown', disable_web_page_preview=True)

def send_kb(chat_id, text, rows):
    kb = {'inline_keyboard': [[{'text': t, 'callback_data': cb} for t, cb in row] for row in rows]}
    return tg('sendMessage', chat_id=chat_id, text=text,
               parse_mode='Markdown', reply_markup=kb)

def edit_kb(chat_id, msg_id, text, rows):
    kb = {'inline_keyboard': [[{'text': t, 'callback_data': cb} for t, cb in row] for row in rows]}
    tg('editMessageText', chat_id=chat_id, message_id=msg_id,
       text=text, parse_mode='Markdown', reply_markup=kb)

def answer_cb(cb_id, text=''):
    tg('answerCallbackQuery', callback_query_id=cb_id, text=text)

def get_updates(offset=None):
    params = {'timeout': 30, 'allowed_updates': ['message', 'callback_query']}
    if offset: params['offset'] = offset
    try:
        r = requests.get(f'{BASE}/getUpdates', params=params, timeout=35, proxies=_PROXIES)
        return r.json().get('result', [])
    except Exception:
        return []


# ── Tag detection ─────────────────────────────────────────────────

def extract_tag(title, conn):
    """
    Procura ["Tag Name"] no título.
    Retorna (titulo_limpo, tag_id, tag_name, tag_color) ou (titulo, None, None, None).
    """
    match = TAG_PATTERN.search(title)
    if not match:
        return title, None, None, None
    tag_name = match.group(1).strip()
    row = conn.execute(
        "SELECT id, name, color FROM tags WHERE LOWER(name)=LOWER(?)", (tag_name,)
    ).fetchone()
    if not row:
        return title, None, None, None
    clean = TAG_PATTERN.sub('', title).strip()
    return clean, row['id'], row['name'], row['color']

def tag_line(tag_name, tag_color):
    """Retorna linha formatada para confirmações, ou string vazia."""
    if not tag_name:
        return ''
    return f'\n🏷 _{tag_name}_'

# ── Helpers de parsing ────────────────────────────────────────────

def parse_date(s):
    try:
        d = datetime.strptime(s.strip(), '%d/%m')
        r = d.replace(year=date.today().year).strftime('%Y-%m-%d')
        if r < str(date.today()):
            r = d.replace(year=date.today().year + 1).strftime('%Y-%m-%d')
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
    return [[('🟢  Leve', 'ef:low'), ('🟡  Médio', 'ef:medium'), ('🔴  Intenso', 'ef:high')]]

def deadline_kb():
    today    = str(date.today())
    tomorrow = str(date.today() + timedelta(1))
    week     = str(date.today() + timedelta(7))
    return [
        [('📅  Hoje', f'dl:{today}'), ('📅  Amanhã', f'dl:{tomorrow}'), ('📅  1 semana', f'dl:{week}')],
        [('✏️  Digitar data', 'dl:custom'), ('∅  Sem prazo', 'dl:none')],
    ]

def days_kb(selected):
    sel = list(selected)
    icons = ['✅' if i in sel else '☐' for i in range(7)]
    return [
        [(f"{icons[i]} {DAY_NAMES[i]}", f"day:{i}") for i in range(4)],
        [(f"{icons[i]} {DAY_NAMES[i]}", f"day:{i}") for i in range(4, 7)],
        [('📅  Todo dia', 'days:all'), ('💼  Dias úteis', 'days:work'), ('✅  Confirmar', 'days:ok')],
    ]

def days_text(name, selected):
    sel_str = fmt_days(selected) if selected else '_nenhum selecionado_'
    return (
        f"{hdr('🔁', 'Novo Hábito')}\n"
        f"📌 *{name}*\n\n"
        f"Selecione os *dias da semana:*\n"
        f"{sel_str}"
    )

def dur_kb():
    return [
        [('15 min', 'dur:15'), ('20 min', 'dur:20'), ('30 min', 'dur:30')],
        [('45 min', 'dur:45'), ('60 min', 'dur:60'), ('90 min', 'dur:90')],
        [('✏️  Outro', 'dur:custom')],
    ]

def evt_date_kb():
    today    = str(date.today())
    tomorrow = str(date.today() + timedelta(1))
    return [
        [('📅  Hoje', f'evtd:{today}'), ('📅  Amanhã', f'evtd:{tomorrow}')],
        [('✏️  Digitar data', 'evtd:custom'), ('∅  Sem data', 'evtd:none')],
    ]

def blk_day_kb():
    return [
        [(DAY_FULL[i], f'blkd:{i}') for i in range(4)],
        [(DAY_FULL[i], f'blkd:{i}') for i in range(4, 7)],
    ]

def tags_kb(conn):
    """Teclado com as tags disponíveis + opção 'Sem tag'. Retorna None se não houver tags."""
    rows = conn.execute("SELECT id, name FROM tags ORDER BY name").fetchall()
    if not rows:
        return None
    buttons = [(row['name'], f"tag:{row['id']}") for row in rows]
    buttons.append(('∅  Sem tag', 'tag:none'))
    return [buttons[i:i+2] for i in range(0, len(buttons), 2)]

# ── /start e /ajuda ───────────────────────────────────────────────

def cmd_start(chat_id, _):
    send(chat_id, (
        f"👋 *Bem-vindo ao Rotina!*\n"
        f"_{SEP}_\n\n"
        "Seu assistente de rotina inteligente.\n"
        "Use /ajuda para ver todos os comandos disponíveis."
    ))

def cmd_ajuda(chat_id, _):
    send(chat_id, (
        f"{hdr('📱', 'Rotina — Comandos')}\n"
        "\n"
        "*Tarefas*\n"
        "  /tarefa · /tarefas\n"
        "  /concluir N · /excluir\\_tarefa N\n"
        "\n"
        "*Eventos*\n"
        "  /evento · /eventos\n"
        "  /excluir\\_evento N\n"
        "\n"
        "*Hábitos*\n"
        "  /habito · /habitos\n"
        "  /excluir\\_habito N\n"
        "\n"
        "*Blocos Fixos*\n"
        "  /bloco · /blocos\n"
        "  /excluir\\_bloco N\n"
        "\n"
        f"{SEP}\n"
        "*Agenda do dia*\n"
        "  /hoje — plano com sugestões"
    ))

# ── TAREFAS ───────────────────────────────────────────────────────

def _get_tasks(conn):
    return conn.execute(
        "SELECT * FROM tasks WHERE is_event=0 AND status!='done' ORDER BY due_date, created_at"
    ).fetchall()

def cmd_tarefas(chat_id, _):
    conn = get_db(); rows = _get_tasks(conn); conn.close()
    if not rows:
        send(chat_id, f"{hdr('📋', 'Tarefas')}\n\n_Nenhuma tarefa pendente._ ✅")
        return
    lines = [f"{hdr('📋', 'Tarefas Pendentes', f'{len(rows)} no total')}\n"]
    for i, t in enumerate(rows, 1):
        ef  = EFFORT_ICON.get(t['effort'], '⚪')
        due = f"  📅 {fmt_date(t['due_date'])}" if t['due_date'] else '  _sem prazo_'
        lines.append(f"*{i}.* {ef} {t['title']}")
        lines.append(due)
        lines.append('')
    lines.append(f"{SEP}")
    lines.append('/concluir N · /excluir\\_tarefa N')
    send(chat_id, '\n'.join(lines))

def cmd_tarefa(chat_id, args):
    if not args:
        st_set(chat_id, 'task:title')
        send(chat_id, f"{hdr('➕', 'Nova Tarefa')}\n\n✏️ Qual o *título* da tarefa?")
        return
    st_set(chat_id, 'task:effort', title=args)
    send_kb(chat_id,
        f"{hdr('➕', 'Nova Tarefa')}\n"
        f"{task_context(title=args)}"
        f"⚡ Qual o *esforço cognitivo*?",
        effort_kb())

def cmd_concluir(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "Use: `/concluir N`  _(ex: /concluir 2)_"); return
    conn = get_db(); rows = _get_tasks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido. Use /tarefas para ver a lista."); return
    task = rows[n]
    conn.execute("UPDATE tasks SET status='done' WHERE id=?", (task['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"✅ *Concluída!*\n{SEP}\n📌 {task['title']}")

def cmd_excluir_tarefa(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "Use: `/excluir_tarefa N`  _(ex: /excluir\\_tarefa 2)_"); return
    conn = get_db(); rows = _get_tasks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido. Use /tarefas para ver a lista."); return
    task = rows[n]
    conn.execute("DELETE FROM tasks WHERE id=?", (task['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ *Excluída*\n{SEP}\n📌 {task['title']}")

# ── EVENTOS ───────────────────────────────────────────────────────

def _get_events(conn):
    return conn.execute(
        "SELECT * FROM tasks WHERE is_event=1 AND (event_date IS NULL OR event_date>=?) "
        "ORDER BY event_date, start_time", (str(date.today()),)
    ).fetchall()

def cmd_eventos(chat_id, _):
    conn = get_db(); rows = _get_events(conn); conn.close()
    if not rows:
        send(chat_id, f"{hdr('📅', 'Eventos')}\n\n_Nenhum evento próximo._")
        return
    lines = [f"{hdr('📅', 'Próximos Eventos', f'{len(rows)} no total')}\n"]
    for i, e in enumerate(rows, 1):
        lines.append(f"*{i}.* {e['title']}")
        detail = []
        if e['event_date']: detail.append(f"📅 {fmt_date(e['event_date'])}")
        if e['start_time'] and e['end_time']:
            detail.append(f"⏰ {e['start_time']}–{e['end_time']}")
        elif e['start_time']:
            detail.append(f"⏰ {e['start_time']}")
        if detail: lines.append('  ' + '  ·  '.join(detail))
        else: lines.append('  _sem data definida_')
        lines.append('')
    lines.append(f"{SEP}")
    lines.append('/excluir\\_evento N')
    send(chat_id, '\n'.join(lines))

def cmd_evento(chat_id, args):
    if not args:
        st_set(chat_id, 'evt:title')
        send(chat_id, f"{hdr('📅', 'Novo Evento')}\n\n✏️ Qual o *nome* do evento?")
        return
    st_set(chat_id, 'evt:date', title=args)
    send_kb(chat_id,
        f"{hdr('📅', 'Novo Evento')}\n"
        f"{evt_context(title=args)}"
        f"📅 Qual a *data* do evento?",
        evt_date_kb())

def cmd_excluir_evento(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "Use: `/excluir_evento N`"); return
    conn = get_db(); rows = _get_events(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido. Use /eventos para ver a lista."); return
    ev = rows[n]
    conn.execute("DELETE FROM tasks WHERE id=?", (ev['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ *Excluído*\n{SEP}\n📌 {ev['title']}")

# ── HÁBITOS ───────────────────────────────────────────────────────

def _get_habits(conn):
    rows = conn.execute("SELECT * FROM habits ORDER BY name").fetchall()
    result = []
    for r in rows:
        d = dict(r); d['days_of_week'] = json.loads(d.get('days_of_week', '[]'))
        result.append(d)
    return result

def cmd_habitos(chat_id, _):
    conn = get_db(); rows = _get_habits(conn); conn.close()
    if not rows:
        send(chat_id, f"{hdr('🔁', 'Hábitos')}\n\n_Nenhum hábito cadastrado._")
        return
    lines = [f"{hdr('🔁', 'Hábitos Ativos', f'{len(rows)} no total')}\n"]
    for i, h in enumerate(rows, 1):
        status = '' if h.get('is_active', 1) else ' _(inativo)_'
        lines.append(f"*{i}.* {h['name']}{status}")
        lines.append(f"  ⏱ {h['duration_minutes']} min  ·  {fmt_days(h['days_of_week'])}")
        lines.append('')
    lines.append(f"{SEP}")
    lines.append('/excluir\\_habito N')
    send(chat_id, '\n'.join(lines))

def cmd_habito(chat_id, args):
    if not args:
        st_set(chat_id, 'hab:name')
        send(chat_id, f"{hdr('🔁', 'Novo Hábito')}\n\n✏️ Qual o *nome* do hábito?")
        return
    _ask_hab_days(chat_id, args)

def _ask_hab_days(chat_id, name):
    st_set(chat_id, 'hab:days', name=name, days=[])
    r = send_kb(chat_id, days_text(name, []), days_kb([]))
    if r.get('ok'):
        STATES[chat_id]['msg_id'] = r['result']['message_id']

def cmd_excluir_habito(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "Use: `/excluir_habito N`"); return
    conn = get_db(); rows = _get_habits(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido. Use /habitos para ver a lista."); return
    h = rows[n]
    conn.execute("DELETE FROM habits WHERE id=?", (h['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ *Excluído*\n{SEP}\n📌 {h['name']}")

# ── BLOCOS FIXOS ──────────────────────────────────────────────────

def _get_blocks(conn):
    return conn.execute(
        "SELECT * FROM fixed_blocks WHERE is_active=1 ORDER BY day_of_week, start_time"
    ).fetchall()

def cmd_blocos(chat_id, _):
    conn = get_db(); rows = _get_blocks(conn); conn.close()
    if not rows:
        send(chat_id, f"{hdr('🏫', 'Blocos Fixos')}\n\n_Nenhum bloco fixo cadastrado._")
        return
    lines = [f"{hdr('🏫', 'Blocos Fixos', f'{len(rows)} no total')}\n"]
    for i, b in enumerate(rows, 1):
        lines.append(f"*{i}.* {b['label']}")
        lines.append(f"  📆 {DAY_FULL[b['day_of_week']]}  ·  ⏰ {b['start_time']}–{b['end_time']}")
        lines.append('')
    lines.append(f"{SEP}")
    lines.append('/excluir\\_bloco N')
    send(chat_id, '\n'.join(lines))

def cmd_bloco(chat_id, args):
    if not args:
        st_set(chat_id, 'blk:name')
        send(chat_id, f"{hdr('🏫', 'Novo Bloco Fixo')}\n\n✏️ Qual o *nome* do bloco?")
        return
    st_set(chat_id, 'blk:day', name=args)
    send_kb(chat_id,
        f"{hdr('🏫', 'Novo Bloco Fixo')}\n"
        f"{blk_context(name=args)}"
        f"📆 Qual o *dia da semana*?",
        blk_day_kb())

def cmd_excluir_bloco(chat_id, args):
    if not args or not args.strip().isdigit():
        send(chat_id, "Use: `/excluir_bloco N`"); return
    conn = get_db(); rows = _get_blocks(conn)
    n = int(args.strip()) - 1
    if not (0 <= n < len(rows)):
        conn.close(); send(chat_id, "❌ Número inválido. Use /blocos para ver a lista."); return
    b = rows[n]
    conn.execute("DELETE FROM fixed_blocks WHERE id=?", (b['id'],))
    conn.commit(); conn.close()
    send(chat_id, f"🗑️ *Excluído*\n{SEP}\n📌 {b['label']}")

# ── PLANO DO DIA ──────────────────────────────────────────────────

def cmd_hoje(chat_id, _):
    today    = str(date.today())
    today_dt = date.today()
    dow      = today_dt.weekday()  # 0=Mon
    js_dow   = (dow + 1) % 7      # 0=Sun
    dia_nome = DAY_FULL[js_dow]
    mes_nome = MONTH_NAMES[today_dt.month]
    data_fmt = f"{dia_nome}, {today_dt.day} de {mes_nome}"

    conn = get_db()
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

        stress = STRESS_LABEL.get(round(day_weight) if day_weight else 0, '⚪️ Nenhuma')

        lines = [
            hdr('☀️', 'Plano de Hoje', data_fmt),
            f"\n⚡ *Carga cognitiva:* {stress}",
        ]

        if events:
            lines.append(f"\n{SEP}")
            lines.append("📅 *Eventos de hoje*")
            for e in events:
                horario = ''
                if e['start_time'] and e['end_time']:
                    horario = f"  ⏰ {e['start_time']}–{e['end_time']}"
                elif e['start_time']:
                    horario = f"  ⏰ {e['start_time']}"
                lines.append(f"• {e['title']}{horario}")

        if confirmed:
            lines.append(f"\n{SEP}")
            lines.append("✅ *Atividades agendadas*")
            for s in confirmed:
                icon  = '✓' if s['status'] == 'done' else '▶'
                label = f"~~{s['source_name']}~~" if s['status'] == 'done' else s['source_name']
                lines.append(f"{icon}  {label}  `{s['suggested_start']}–{s['suggested_end']}`")

        if suggested:
            lines.append(f"\n{SEP}")
            lines.append("💡 *Sugestões para hoje*")
            prev_start = None
            for s in suggested:
                if s['suggested_start'] != prev_start:
                    if prev_start: lines.append('')
                    lines.append(f"_Janela {s['suggested_start']}–{s['suggested_end']}_")
                    prev_start = s['suggested_start']
                lines.append(f"  •  {s['source_name']}")

        if not events and not confirmed and not suggested:
            lines.append(f"\n{SEP}")
            lines.append("_Nenhuma atividade planejada para hoje._")

        send(chat_id, '\n'.join(lines))

    except Exception as e:
        conn.close()
        send(chat_id, f"❌ *Erro ao gerar plano*\n{SEP}\n_{e}_")

# ── Criadores no banco ────────────────────────────────────────────

def _save_task(chat_id, title, effort, due_date, tag_id=None, tag_name=None, tag_color=None):
    conn = get_db()
    conn.execute(
        "INSERT INTO tasks (id,title,type,effort,estimated_minutes,status,due_date,is_event,tag_id) "
        "VALUES (?,?,'personal',?,60,'pending',?,0,?)",
        (str(uuid.uuid4()), title, effort, due_date, tag_id)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    due_line = f"\n📅 Prazo: {fmt_date(due_date)}" if due_date else '\n_sem prazo definido_'
    send(chat_id, (
        f"✅ *Tarefa criada!*\n{SEP}\n"
        f"📌 {title}\n"
        f"⚡ {fmt_effort(effort)}"
        f"{due_line}"
        f"{tag_line(tag_name, tag_color)}"
    ))

def _save_evento(chat_id, title, event_date, start_time, end_time, tag_id=None, tag_name=None, tag_color=None):
    conn = get_db()
    conn.execute(
        "INSERT INTO tasks (id,title,type,effort,estimated_minutes,status,is_event,event_date,start_time,end_time,tag_id) "
        "VALUES (?,?,'personal','low',60,'pending',1,?,?,?,?)",
        (str(uuid.uuid4()), title, event_date, start_time, end_time, tag_id)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    lines = [f"✅ *Evento criado!*\n{SEP}\n📌 {title}"]
    if event_date: lines.append(f"📅 {fmt_date(event_date)}")
    if start_time and end_time: lines.append(f"⏰ {start_time}–{end_time}")
    elif start_time: lines.append(f"⏰ {start_time}")
    if tag_name: lines.append(tag_line(tag_name, tag_color))
    send(chat_id, '\n'.join(lines))

def _save_habito(chat_id, name, days, duration):
    conn = get_db()
    conn.execute(
        "INSERT INTO habits (id,name,activity_type,duration_minutes,days_of_week,max_stress_weight,is_active) "
        "VALUES (?,?,'personal',?,?,5,1)",
        (str(uuid.uuid4()), name, duration, json.dumps(days))
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    send(chat_id, (
        f"✅ *Hábito criado!*\n{SEP}\n"
        f"📌 {name}\n"
        f"⏱ {duration} min\n"
        f"📆 {fmt_days(days)}"
    ))

def _save_bloco(chat_id, name, day, start_time, end_time):
    conn = get_db()
    conn.execute(
        "INSERT INTO fixed_blocks (id,label,day_of_week,start_time,end_time,is_active) "
        "VALUES (?,?,?,?,?,1)",
        (str(uuid.uuid4()), name, day, start_time, end_time)
    )
    conn.commit(); conn.close()
    st_clear(chat_id)
    send(chat_id, (
        f"✅ *Bloco fixo criado!*\n{SEP}\n"
        f"📌 {name}\n"
        f"📆 {DAY_FULL[day]}\n"
        f"⏰ {start_time}–{end_time}"
    ))

# ── Callback query ────────────────────────────────────────────────

def handle_callback(cb):
    chat_id = cb['message']['chat']['id']
    cb_id   = cb['id']
    data    = cb['data']
    st      = st_get(chat_id)
    step    = st.get('step', '')

    answer_cb(cb_id)

    # Seleção de tag (tarefa ou evento)
    if data.startswith('tag:') and step in ('task:tag', 'evt:tag'):
        val = data[4:]
        tag_id, tag_name, tag_color = None, None, None
        if val != 'none':
            conn2 = get_db()
            row = conn2.execute("SELECT name, color FROM tags WHERE id=?", (val,)).fetchone()
            conn2.close()
            if row:
                tag_id, tag_name, tag_color = val, row['name'], row['color']

        if step == 'task:tag':
            st_set(chat_id, 'task:effort',
                   title=st['title'], tag_id=tag_id, tag_name=tag_name, tag_color=tag_color)
            send_kb(chat_id,
                f"{hdr('➕', 'Nova Tarefa')}\n"
                f"{task_context(title=st['title'], tag_name=tag_name)}"
                f"⚡ Qual o *esforço cognitivo*?",
                effort_kb())
        else:  # evt:tag
            st_set(chat_id, 'evt:date',
                   title=st['title'], tag_id=tag_id, tag_name=tag_name, tag_color=tag_color)
            send_kb(chat_id,
                f"{hdr('📅', 'Novo Evento')}\n"
                f"{evt_context(title=st['title'], tag_name=tag_name)}"
                f"📅 Qual a *data* do evento?",
                evt_date_kb())

    # Esforço da tarefa
    elif data.startswith('ef:') and step == 'task:effort':
        effort = data[3:]
        st_set(chat_id, 'task:deadline', title=st['title'], effort=effort,
               tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
        send_kb(chat_id,
            f"{hdr('➕', 'Nova Tarefa')}\n"
            f"{task_context(title=st['title'], effort=effort, tag_name=st.get('tag_name'))}"
            f"📅 Qual o *prazo*?",
            deadline_kb())

    # Prazo da tarefa
    elif data.startswith('dl:') and step == 'task:deadline':
        val = data[3:]
        if val == 'custom':
            st_set(chat_id, 'task:deadline_text', title=st['title'], effort=st['effort'],
                   tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
            send(chat_id,
                f"{hdr('➕', 'Nova Tarefa')}\n"
                f"{task_context(title=st['title'], effort=st['effort'], tag_name=st.get('tag_name'))}"
                f"✏️ Digite o prazo _(formato DD/MM):_")
            return
        _save_task(chat_id, st['title'], st['effort'], None if val == 'none' else val,
                   tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))

    # Data do evento
    elif data.startswith('evtd:') and step == 'evt:date':
        val = data[5:]
        if val == 'custom':
            st_set(chat_id, 'evt:date_text', title=st['title'],
                   tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
            send(chat_id,
                f"{hdr('📅', 'Novo Evento')}\n"
                f"{evt_context(title=st['title'], tag_name=st.get('tag_name'))}"
                f"✏️ Digite a data _(formato DD/MM):_")
            return
        event_date = None if val == 'none' else val
        st_set(chat_id, 'evt:start', title=st['title'], event_date=event_date,
               tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
        send(chat_id,
            f"{hdr('📅', 'Novo Evento')}\n"
            f"{evt_context(title=st['title'], event_date=event_date, tag_name=st.get('tag_name'))}"
            f"⏰ *Horário de início* _(HH:MM ou /pular):_")

    # Dias do hábito — toggle individual
    elif data.startswith('day:') and step == 'hab:days':
        d   = int(data[4:])
        sel = list(st.get('days', []))
        if d in sel: sel.remove(d)
        else: sel.append(d)
        STATES[chat_id]['days'] = sel
        msg_id = st.get('msg_id')
        if msg_id: edit_kb(chat_id, msg_id, days_text(st['name'], sel), days_kb(sel))

    # Dias do hábito — atalhos
    elif data in ('days:all', 'days:work') and step == 'hab:days':
        sel = list(range(7)) if data == 'days:all' else [1, 2, 3, 4, 5]
        STATES[chat_id]['days'] = sel
        msg_id = st.get('msg_id')
        if msg_id: edit_kb(chat_id, msg_id, days_text(st['name'], sel), days_kb(sel))

    # Dias do hábito — confirmar
    elif data == 'days:ok' and step == 'hab:days':
        days = st.get('days') or list(range(7))
        st_set(chat_id, 'hab:duration', name=st['name'], days=days)
        send_kb(chat_id,
            f"{hdr('🔁', 'Novo Hábito')}\n"
            f"📌 *{st['name']}*\n"
            f"📆 {fmt_days(days)}\n\n"
            f"{SEP}\n"
            f"⏱ Qual a *duração* de cada sessão?",
            dur_kb())

    # Duração do hábito
    elif data.startswith('dur:') and step == 'hab:duration':
        val = data[4:]
        if val == 'custom':
            st_set(chat_id, 'hab:dur_text', name=st['name'], days=st['days'])
            send(chat_id,
                f"{hdr('🔁', 'Novo Hábito')}\n"
                f"📌 *{st['name']}*\n\n"
                f"✏️ Digite a duração em *minutos* _(ex: 45):_")
            return
        _save_habito(chat_id, st['name'], st['days'], int(val))

    # Dia do bloco
    elif data.startswith('blkd:') and step == 'blk:day':
        day = int(data[5:])
        st_set(chat_id, 'blk:start', name=st['name'], day=day)
        send(chat_id,
            f"{hdr('🏫', 'Novo Bloco Fixo')}\n"
            f"{blk_context(name=st['name'], day=day)}"
            f"⏰ *Horário de início* _(HH:MM):_")

# ── Tratamento de texto livre (steps) ────────────────────────────

def handle_text_step(chat_id, text, st):
    step = st['step']

    if step == 'task:title':
        conn = get_db()
        clean_title, tag_id, tag_name, tag_color = extract_tag(text, conn)
        if tag_id:
            # Tag detectada no título — pula etapa de seleção
            conn.close()
            st_set(chat_id, 'task:effort',
                   title=clean_title, tag_id=tag_id, tag_name=tag_name, tag_color=tag_color)
            send_kb(chat_id,
                f"{hdr('➕', 'Nova Tarefa')}\n"
                f"{task_context(title=clean_title, tag_name=tag_name)}"
                f"⚡ Qual o *esforço cognitivo*?",
                effort_kb())
        else:
            kb = tags_kb(conn)
            conn.close()
            if kb:
                st_set(chat_id, 'task:tag', title=text)
                send_kb(chat_id,
                    f"{hdr('➕', 'Nova Tarefa')}\n"
                    f"📌 *{text}*\n\n"
                    f"{SEP}\n"
                    f"🏷 Selecione uma *tag* _(opcional):_",
                    kb)
            else:
                st_set(chat_id, 'task:effort', title=text, tag_id=None, tag_name=None, tag_color=None)
                send_kb(chat_id,
                    f"{hdr('➕', 'Nova Tarefa')}\n"
                    f"{task_context(title=text)}"
                    f"⚡ Qual o *esforço cognitivo*?",
                    effort_kb())

    elif step == 'task:deadline_text':
        d = parse_date(text)
        if not d:
            send(chat_id, "❌ Formato inválido.\nUse *DD/MM* _(ex: 25/06):_"); return
        _save_task(chat_id, st['title'], st['effort'], d,
                   tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))

    elif step == 'evt:title':
        conn = get_db()
        clean_title, tag_id, tag_name, tag_color = extract_tag(text, conn)
        if tag_id:
            conn.close()
            st_set(chat_id, 'evt:date',
                   title=clean_title, tag_id=tag_id, tag_name=tag_name, tag_color=tag_color)
            send_kb(chat_id,
                f"{hdr('📅', 'Novo Evento')}\n"
                f"{evt_context(title=clean_title, tag_name=tag_name)}"
                f"📅 Qual a *data* do evento?",
                evt_date_kb())
        else:
            kb = tags_kb(conn)
            conn.close()
            if kb:
                st_set(chat_id, 'evt:tag', title=text)
                send_kb(chat_id,
                    f"{hdr('📅', 'Novo Evento')}\n"
                    f"📌 *{text}*\n\n"
                    f"{SEP}\n"
                    f"🏷 Selecione uma *tag* _(opcional):_",
                    kb)
            else:
                st_set(chat_id, 'evt:date', title=text, tag_id=None, tag_name=None, tag_color=None)
                send_kb(chat_id,
                    f"{hdr('📅', 'Novo Evento')}\n"
                    f"{evt_context(title=text)}"
                    f"📅 Qual a *data* do evento?",
                    evt_date_kb())

    elif step == 'evt:date_text':
        d = parse_date(text)
        if not d:
            send(chat_id, "❌ Formato inválido.\nUse *DD/MM* _(ex: 25/06):_"); return
        st_set(chat_id, 'evt:start', title=st['title'], event_date=d,
               tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
        send(chat_id,
            f"{hdr('📅', 'Novo Evento')}\n"
            f"{evt_context(title=st['title'], event_date=d, tag_name=st.get('tag_name'))}"
            f"⏰ *Horário de início* _(HH:MM ou /pular):_")

    elif step == 'evt:start':
        t = parse_time(text)
        if not t:
            send(chat_id, "❌ Formato inválido.\nUse *HH:MM* _(ex: 14:30)_ ou /pular"); return
        st_set(chat_id, 'evt:end', title=st['title'],
               event_date=st.get('event_date'), start_time=t,
               tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
        send(chat_id,
            f"{hdr('📅', 'Novo Evento')}\n"
            f"{evt_context(title=st['title'], event_date=st.get('event_date'), start_time=t, tag_name=st.get('tag_name'))}"
            f"⏰ *Horário de fim* _(HH:MM ou /pular):_")

    elif step == 'evt:end':
        t = parse_time(text)
        if not t:
            send(chat_id, "❌ Formato inválido.\nUse *HH:MM* _(ex: 15:30)_ ou /pular"); return
        _save_evento(chat_id, st['title'], st.get('event_date'), st.get('start_time'), t,
                     tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))

    elif step == 'hab:name':
        _ask_hab_days(chat_id, text)

    elif step == 'hab:dur_text':
        try:
            dur = int(text.replace('min', '').strip())
            _save_habito(chat_id, st['name'], st['days'], dur)
        except ValueError:
            send(chat_id, "❌ Digite apenas o número de minutos _(ex: 45):_")

    elif step == 'blk:name':
        st_set(chat_id, 'blk:day', name=text)
        send_kb(chat_id,
            f"{hdr('🏫', 'Novo Bloco Fixo')}\n"
            f"{blk_context(name=text)}"
            f"📆 Qual o *dia da semana*?",
            blk_day_kb())

    elif step == 'blk:start':
        t = parse_time(text)
        if not t:
            send(chat_id, "❌ Formato inválido.\nUse *HH:MM* _(ex: 08:00):_"); return
        st_set(chat_id, 'blk:end', name=st['name'], day=st['day'], start_time=t)
        send(chat_id,
            f"{hdr('🏫', 'Novo Bloco Fixo')}\n"
            f"{blk_context(name=st['name'], day=st['day'], start_time=t)}"
            f"⏰ *Horário de fim* _(HH:MM):_")

    elif step == 'blk:end':
        t = parse_time(text)
        if not t:
            send(chat_id, "❌ Formato inválido.\nUse *HH:MM* _(ex: 09:00):_"); return
        _save_bloco(chat_id, st['name'], st['day'], st['start_time'], t)

# ── Roteador de mensagens ─────────────────────────────────────────

COMMANDS = {
    'start': cmd_start, 'ajuda': cmd_ajuda, 'help': cmd_ajuda,
    'tarefas': cmd_tarefas, 'tarefa': cmd_tarefa,
    'concluir': cmd_concluir, 'excluir_tarefa': cmd_excluir_tarefa,
    'eventos': cmd_eventos, 'evento': cmd_evento, 'excluir_evento': cmd_excluir_evento,
    'habitos': cmd_habitos, 'habito': cmd_habito, 'excluir_habito': cmd_excluir_habito,
    'blocos': cmd_blocos, 'bloco': cmd_bloco, 'excluir_bloco': cmd_excluir_bloco,
    'hoje': cmd_hoje,
}

def handle_message(message):
    chat_id = message['chat']['id']
    text    = message.get('text', '').strip()

    if ALLOWED_CHAT_ID and str(chat_id) != str(ALLOWED_CHAT_ID):
        send(chat_id, "⛔ Acesso não autorizado."); return

    st = st_get(chat_id)

    # /pular — pula campo opcional (horários de evento)
    if text == '/pular' and st:
        step = st['step']
        if step == 'evt:start':
            st_set(chat_id, 'evt:end', title=st['title'],
                   event_date=st.get('event_date'), start_time=None,
                   tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
            send(chat_id,
                f"{hdr('📅', 'Novo Evento')}\n"
                f"{evt_context(title=st['title'], event_date=st.get('event_date'), tag_name=st.get('tag_name'))}"
                f"⏰ *Horário de fim* _(HH:MM ou /pular):_")
            return
        if step == 'evt:end':
            _save_evento(chat_id, st['title'], st.get('event_date'), st.get('start_time'), None,
                         tag_id=st.get('tag_id'), tag_name=st.get('tag_name'), tag_color=st.get('tag_color'))
            return

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
            except Exception as e: send(chat_id, f"❌ *Erro:* _{e}_")
        else:
            send(chat_id, "Comando desconhecido.\nUse /ajuda para ver os comandos disponíveis.")
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
