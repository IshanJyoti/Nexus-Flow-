export const getToken = () => localStorage.getItem('nf_token');

let unauthorizedHandler = () => {};
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = () => {};
  };
}

async function req(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      localStorage.removeItem('nf_token');
      unauthorizedHandler();
    }
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
  createDevice: (b) => req('/devices', { method: 'POST', body: b }),
  updateDevice: (id, b) => req(`/devices/${id}`, { method: 'PATCH', body: b }),
  rotateDeviceKey: (id) => req(`/devices/${id}/rotate-key`, { method: 'POST' }),
  deleteDevice: (id) => req(`/devices/${id}`, { method: 'DELETE' }),
  alerts: () => req('/alerts'),
  clearAlerts: () => req('/alerts', { method: 'DELETE' }),
  stats: () => req('/stats'),
  simulator: () => req('/simulator'),
  startSim: (b) => req('/simulator/start', { method: 'POST', body: b }),
  stopSim: () => req('/simulator/stop', { method: 'POST' }),
};
