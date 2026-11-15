export const getToken = () => localStorage.getItem('nf_token');

async function req(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.errors = data.errors;
    throw err;
  }
  return data;
}

export const api = {
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  register: (b) => req('/auth/register', { method: 'POST', body: b }),
  me: () => req('/auth/me'),
  graphs: () => req('/graphs'),
  createGraph: (b) => req('/graphs', { method: 'POST', body: b }),
  updateGraph: (id, b) => req(`/graphs/${id}`, { method: 'PUT', body: b }),
  deleteGraph: (id) => req(`/graphs/${id}`, { method: 'DELETE' }),
  validate: (b) => req('/graphs/validate', { method: 'POST', body: b }),
  deploy: (id) => req(`/graphs/${id}/deploy`, { method: 'POST' }),
  undeploy: (id) => req(`/graphs/${id}/undeploy`, { method: 'POST' }),
  devices: () => req('/devices'),
  alerts: () => req('/alerts'),
  clearAlerts: () => req('/alerts', { method: 'DELETE' }),
  stats: () => req('/stats'),
  simulator: () => req('/simulator'),
  startSim: (b) => req('/simulator/start', { method: 'POST', body: b }),
  stopSim: () => req('/simulator/stop', { method: 'POST' }),
};
