import os
import hashlib
import hmac
from functools import wraps
from flask import request, jsonify, g

_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"\''))

JWT_SECRET = os.environ.get('JWT_SECRET', 'rotina-secret-change-me')

USERS = {
    'kauany': os.environ.get('USER_KAUANY_PASSWORD', ''),
    'luis':   os.environ.get('USER_LUIS_PASSWORD', ''),
}

USER_DISPLAY = {
    'kauany': 'Kauany',
    'luis':   'Luis',
}


def _hash(password):
    return hashlib.sha256(password.encode()).hexdigest()


def check_credentials(username, password):
    stored = USERS.get(username.lower())
    if stored is None:
        return False
    return hmac.compare_digest(_hash(password), _hash(stored))


def create_token(user_id):
    try:
        import jwt
        return jwt.encode({'sub': user_id}, JWT_SECRET, algorithm='HS256')
    except ImportError:
        import base64, json
        payload = base64.urlsafe_b64encode(
            json.dumps({'sub': user_id}).encode()
        ).decode().rstrip('=')
        sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return f"{payload}.{sig}"


def verify_token(token):
    if not token:
        return None
    try:
        import jwt
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload.get('sub')
    except ImportError:
        pass
    except Exception:
        return None
    # Fallback sem PyJWT
    try:
        import base64, json
        parts = token.split('.')
        if len(parts) != 2:
            return None
        payload_b64, sig = parts
        expected = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        pad = payload_b64 + '=' * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(pad))
        return payload.get('sub')
    except Exception:
        return None


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header[7:] if auth_header.startswith('Bearer ') else ''
        user_id = verify_token(token)
        if not user_id or user_id not in USERS:
            return jsonify({'error': 'Não autorizado'}), 401
        g.user_id = user_id
        return f(*args, **kwargs)
    return decorated
