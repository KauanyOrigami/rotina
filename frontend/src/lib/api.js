const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  stressLevels: {
    list: () => req('GET', '/api/stress-levels'),
    create: (data) => req('POST', '/api/stress-levels', data),
    update: (id, data) => req('PUT', `/api/stress-levels/${id}`, data),
    delete: (id) => req('DELETE', `/api/stress-levels/${id}`),
  },
  fixedBlocks: {
    list: () => req('GET', '/api/fixed-blocks'),
    create: (data) => req('POST', '/api/fixed-blocks', data),
    update: (id, data) => req('PUT', `/api/fixed-blocks/${id}`, data),
    delete: (id) => req('DELETE', `/api/fixed-blocks/${id}`),
  },
  habits: {
    list: () => req('GET', '/api/habits'),
    create: (data) => req('POST', '/api/habits', data),
    update: (id, data) => req('PUT', `/api/habits/${id}`, data),
    delete: (id) => req('DELETE', `/api/habits/${id}`),
  },
  tasks: {
    list: (params) => req('GET', `/api/tasks${params ? '?' + new URLSearchParams(params) : ''}`),
    create: (data) => req('POST', '/api/tasks', data),
    update: (id, data) => req('PUT', `/api/tasks/${id}`, data),
    delete: (id) => req('DELETE', `/api/tasks/${id}`),
  },
  dayPlan: {
    get: (date) => req('GET', `/api/day-plan/${date}`),
  },
  weekPlan: {
    get: (start) => req('GET', `/api/week-plan?start=${start}`),
  },
  slots: {
    updateStatus: (id, status) => req('PATCH', `/api/slots/${id}/status`, { status }),
  },
  settings: {
    get: () => req('GET', '/api/settings'),
    update: (data) => req('PATCH', '/api/settings', data),
  },
  tags: {
    list:   ()        => req('GET',    '/api/tags'),
    create: (data)    => req('POST',   '/api/tags', data),
    update: (id, data)=> req('PUT',    `/api/tags/${id}`, data),
    delete: (id)      => req('DELETE', `/api/tags/${id}`),
  },
  telegram: {
    status: () => req('GET', '/api/telegram/status'),
  },
  ms: {
    authUrl:    ()     => req('GET',    '/api/ms/auth-url'),
    status:     ()     => req('GET',    '/api/ms/status'),
    disconnect: ()     => req('DELETE', '/api/ms/disconnect'),
    import:     (days) => req('POST',   '/api/ms/import', { days }),
  },
};
