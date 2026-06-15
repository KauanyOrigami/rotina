import os
import uuid
import urllib.parse
import requests
from datetime import datetime, timedelta

# ── Carrega .env se existir ───────────────────────────────────────
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"\''))

MS_CLIENT_ID     = os.environ.get('MS_CLIENT_ID', '')
MS_CLIENT_SECRET = os.environ.get('MS_CLIENT_SECRET', '')
MS_TENANT_ID     = os.environ.get('MS_TENANT_ID', 'common')
MS_REDIRECT_URI  = os.environ.get('MS_REDIRECT_URI', 'http://localhost:3001/api/ms/callback')
FRONTEND_URL     = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

_AUTHORITY = 'https://login.microsoftonline.com'
_SCOPES    = 'openid profile email User.Read Calendars.Read offline_access'

def is_configured():
    return bool(MS_CLIENT_ID and MS_CLIENT_SECRET)

def get_auth_url(user_id='kauany'):
    params = urllib.parse.urlencode({
        'client_id':     MS_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri':  MS_REDIRECT_URI,
        'scope':         _SCOPES,
        'response_mode': 'query',
        'prompt':        'select_account',
        'state':         user_id,
    })
    return f'{_AUTHORITY}/{MS_TENANT_ID}/oauth2/v2.0/authorize?{params}'

def _token_request(data, conn):
    resp = requests.post(
        f'{_AUTHORITY}/{MS_TENANT_ID}/oauth2/v2.0/token',
        data={**data, 'client_id': MS_CLIENT_ID, 'client_secret': MS_CLIENT_SECRET},
        timeout=15,
    )
    resp.raise_for_status()
    r = resp.json()
    if 'error' in r:
        raise Exception(r.get('error_description', r['error']))

    expiry = (datetime.utcnow() + timedelta(seconds=r.get('expires_in', 3600) - 60)).isoformat()
    for k, v in [
        ('ms_access_token',  r['access_token']),
        ('ms_refresh_token', r.get('refresh_token', '')),
        ('ms_token_expiry',  expiry),
    ]:
        conn.execute("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", (k, v))
    conn.commit()
    return r['access_token']

def handle_callback(code, conn):
    token = _token_request({
        'grant_type':  'authorization_code',
        'code':         code,
        'redirect_uri': MS_REDIRECT_URI,
        'scope':        _SCOPES,
    }, conn)
    try:
        info  = _graph_get(token, 'me', {'$select': 'displayName,mail,userPrincipalName'})
        name  = info.get('displayName', '')
        email = info.get('mail') or info.get('userPrincipalName', '')
        conn.execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('ms_user_name',?)",  (name,))
        conn.execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('ms_user_email',?)", (email,))
        conn.commit()
    except Exception:
        pass
    return token

def get_access_token(conn):
    row = conn.execute("SELECT value FROM settings WHERE key='ms_access_token'").fetchone()
    if not row:
        return None

    expiry_row = conn.execute("SELECT value FROM settings WHERE key='ms_token_expiry'").fetchone()
    if expiry_row:
        try:
            if datetime.utcnow() < datetime.fromisoformat(expiry_row['value']):
                return row['value']
        except ValueError:
            pass

    refresh_row = conn.execute("SELECT value FROM settings WHERE key='ms_refresh_token'").fetchone()
    if not refresh_row or not refresh_row['value']:
        return None
    try:
        return _token_request({
            'grant_type':    'refresh_token',
            'refresh_token':  refresh_row['value'],
            'scope':          _SCOPES,
        }, conn)
    except Exception:
        return None

def get_connection_info(conn):
    name_row  = conn.execute("SELECT value FROM settings WHERE key='ms_user_name'").fetchone()
    email_row = conn.execute("SELECT value FROM settings WHERE key='ms_user_email'").fetchone()
    return {
        'name':  name_row['value']  if name_row  else '',
        'email': email_row['value'] if email_row else '',
    }

def disconnect(conn):
    for key in ('ms_access_token', 'ms_refresh_token', 'ms_token_expiry', 'ms_user_name', 'ms_user_email'):
        conn.execute("DELETE FROM settings WHERE key=?", (key,))
    conn.commit()

def _graph_get(token, path, params=None):
    resp = requests.get(
        f'https://graph.microsoft.com/v1.0/{path}',
        headers={'Authorization': f'Bearer {token}', 'Prefer': 'outlook.timezone="UTC"'},
        params=params or {},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()

def _parse_dt(dt_str):
    clean = dt_str.replace('Z', '').split('+')[0].split('.')[0]
    return datetime.strptime(clean, '%Y-%m-%dT%H:%M:%S')

def import_calendar_events(conn, days=30):
    token = get_access_token(conn)
    if not token:
        raise Exception('Não conectado ao Microsoft')

    now   = datetime.utcnow()
    start = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    end   = (now + timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')

    data   = _graph_get(token, 'me/calendarView', {
        'startDateTime': start,
        'endDateTime':   end,
        '$select':       'id,subject,start,end',
        '$orderby':      'start/dateTime',
        '$top':          100,
    })
    events = data.get('value', [])

    imported = skipped = 0
    for ev in events:
        ext_id = ev['id']
        if conn.execute('SELECT 1 FROM tasks WHERE external_id=?', (ext_id,)).fetchone():
            skipped += 1
            continue

        s = _parse_dt(ev['start']['dateTime'])
        e = _parse_dt(ev['end']['dateTime'])

        conn.execute('''
            INSERT INTO tasks
                (id,title,type,effort,estimated_minutes,status,
                 is_event,event_date,start_time,end_time,external_id)
            VALUES (?,?,'personal','low',60,'pending',1,?,?,?,?)
        ''', (
            str(uuid.uuid4()),
            ev.get('subject') or '(Sem título)',
            s.strftime('%Y-%m-%d'),
            s.strftime('%H:%M'),
            e.strftime('%H:%M'),
            ext_id,
        ))
        imported += 1

    conn.commit()
    return {'imported': imported, 'skipped': skipped}
