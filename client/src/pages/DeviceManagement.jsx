import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Copy, Cpu, KeyRound, MapPin, Pencil, Plus, RefreshCw, RotateCw, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useLive } from '../LiveContext';
import { useToast } from '../Toast';

const EMPTY_FORM = { deviceId: '', name: '', description: '', location: '' };
const ageLabel = (value) => {
  if (!value) return 'Never connected';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

export default function DeviceManagement() {
  const toast = useToast();
  const { devices: liveDevices, connected } = useLive();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [issuedKey, setIssuedKey] = useState(null);
  const [now, setNow] = useState(Date.now());

  const loadDevices = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await api.devices();
      setDevices(list);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load devices.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const poll = setInterval(() => loadDevices(true), 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [loadDevices]);

  const counts = useMemo(() => devices.reduce((acc, device) => {
    const live = liveDevices[device.deviceId];
    const lastSeen = live?.lastSeen || (device.lastSeen ? new Date(device.lastSeen).getTime() : 0);
    if (lastSeen && now - lastSeen <= 30000) acc.online += 1;
    else acc.offline += 1;
    return acc;
  }, { online: 0, offline: 0 }), [devices, liveDevices, now]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (device) => {
    setEditing(device);
    setForm({ deviceId: device.deviceId, name: device.name, description: device.description || '', location: device.location || '' });
    setModal(true);
  };

  const saveDevice = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateDevice(editing.id, { name: form.name, description: form.description, location: form.location });
        toast('Device details updated.', 'success');
      } else {
        const result = await api.createDevice(form);
        setIssuedKey({ device: result.device, key: result.deviceKey });
        toast('Device registered. Copy its key now; it will not be shown again.', 'success', 7000);
      }
      setModal(false);
      await loadDevices(true);
    } catch (e) {
      toast(e.message || 'Could not save device.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeDevice = async (device) => {
    if (!window.confirm(`Delete device "${device.name}" (${device.deviceId})? Its API key will be revoked. Historical telemetry will remain in the database, and this device ID cannot be reused.`)) return;
    try {
      await api.deleteDevice(device.id);
      setDevices((current) => current.filter((item) => item.id !== device.id));
      toast('Device registration deleted.', 'success');
    } catch (e) {
      toast(e.message || 'Could not delete device.', 'error');
    }
  };

  const rotateKey = async (device) => {
    if (!window.confirm(`Rotate the API key for ${device.deviceId}? The current key will stop working immediately.`)) return;
    try {
      const result = await api.rotateDeviceKey(device.id);
      setIssuedKey({ device: result.device, key: result.deviceKey });
      toast('Device key rotated. Update the device firmware/configuration.', 'success', 7000);
    } catch (e) {
      toast(e.message || 'Could not rotate device key.', 'error');
    }
  };

  const copyKey = async () => {
    if (!issuedKey?.key) return;
    try {
      await navigator.clipboard.writeText(issuedKey.key);
      toast('Device key copied.', 'success');
    } catch {
      toast('Clipboard access failed. Select and copy the key manually.', 'error');
    }
  };

  return (
    <div className="scroll-page">
      <div className="page-head">
        <div>
          <h2>Device management</h2>
          <p className="muted">Register physical devices, manage credentials and monitor their real telemetry activity.</p>
        </div>
        <div className="head-actions">
          <span className={`pill ${connected ? 'ok' : 'bad'}`}>{connected ? 'Live channel connected' : 'Live channel disconnected'}</span>
          <button className="btn" onClick={() => loadDevices(true)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh</button>
          <button className="btn primary" onClick={openCreate}><Plus size={15} /> Register device</button>
        </div>
      </div>

      <div className="device-summary">
        <div className="card device-summary-card"><Cpu size={18} /><div><small>Registered devices</small><b>{devices.length}</b></div></div>
        <div className="card device-summary-card online-summary"><Activity size={18} /><div><small>Online · seen in last 30 seconds</small><b>{counts.online}</b></div></div>
        <div className="card device-summary-card offline-summary"><Activity size={18} /><div><small>Offline / not yet connected</small><b>{counts.offline}</b></div></div>
      </div>

      {error && <div className="form-error device-error">{error} <button className="btn sm" onClick={() => loadDevices()}>Retry</button></div>}

      {loading ? <div className="card empty-card">Loading registered devices…</div> : !devices.length ? (
        <div className="card empty-card device-empty">
          <Cpu size={30} />
          <h3>No devices registered</h3>
          <p>Register a real device to issue its unique API key. The device can then send authenticated telemetry to the ingestion API.</p>
          <button className="btn primary" onClick={openCreate}><Plus size={14} /> Register your first device</button>
        </div>
      ) : (
        <div className="device-management-grid">
          {devices.map((device) => {
            const live = liveDevices[device.deviceId];
            const lastSeen = live?.lastSeen || (device.lastSeen ? new Date(device.lastSeen).getTime() : 0);
            const online = !!lastSeen && now - lastSeen <= 30000;
            const metrics = { ...(device.metrics || {}), ...(live?.metrics || {}) };
            return (
              <article className="card managed-device" key={device.id}>
                <div className="managed-device-head">
                  <div className="managed-device-icon"><Cpu size={19} /></div>
                  <div className="managed-device-title"><h3>{device.name}</h3><code>{device.deviceId}</code></div>
                  <span className={`pill ${online ? 'ok' : 'muted-pill'}`}><i className={online ? 'device-status-dot' : ''} />{online ? 'Online' : 'Offline'}</span>
                </div>
                {device.description && <p className="managed-description">{device.description}</p>}
                <div className="managed-meta">
                  <span><MapPin size={13} />{device.location || 'Location not specified'}</span>
                  <span><Activity size={13} />Last seen: {ageLabel(lastSeen)}</span>
                </div>
                <div className="managed-metrics">
                  <div className="managed-section-label">Latest reported metrics</div>
                  {Object.keys(metrics).length ? Object.entries(metrics).map(([metric, reading]) => (
                    <div className="kv" key={metric}><span>{metric}</span><b>{reading.value == null ? '—' : Number(reading.value).toLocaleString(undefined, { maximumFractionDigits: 3 })}</b></div>
                  )) : <p className="muted small">No telemetry has been received from this device yet.</p>}
                </div>
                <div className="managed-footer">
                  <span className="muted small">Key: {device.apiKeyPrefix}••••••••</span>
                  <div className="managed-actions">
                    <button className="icon-btn" title="Edit device details" onClick={() => openEdit(device)}><Pencil size={15} /></button>
                    <button className="icon-btn" title="Rotate API key" onClick={() => rotateKey(device)}><RotateCw size={15} /></button>
                    <button className="icon-btn delete-icon" title="Delete device" onClick={() => removeDevice(device)}><Trash2 size={15} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
          <form className="card device-modal" onSubmit={saveDevice}>
            <div className="modal-head"><div><h3>{editing ? 'Edit device' : 'Register a device'}</h3><p className="muted small">{editing ? 'Update the device metadata.' : 'Create a permanent registry entry and a unique device credential.'}</p></div><button type="button" className="icon-btn" onClick={() => setModal(false)}><X size={17} /></button></div>
            <label>Device ID<input required minLength={2} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._:-]{1,63}" value={form.deviceId} disabled={!!editing} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} placeholder="e.g. plant-01-sensor-a" /></label>
            <label>Display name<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Boiler temperature sensor" /></label>
            <label>Location<input maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Plant 1 · Boiler room" /></label>
            <label>Description<textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional device details" /></label>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Register device'}</button></div>
          </form>
        </div>
      )}

      {issuedKey && (
        <div className="modal-backdrop">
          <section className="card device-modal key-modal">
            <div className="modal-head"><div><h3><KeyRound size={18} /> Device API key</h3><p className="muted small">This secret is shown only once. Copy it now and store it securely on the physical device.</p></div><button type="button" className="icon-btn" onClick={() => setIssuedKey(null)}><X size={17} /></button></div>
            <p className="small muted">{issuedKey.device.name} · {issuedKey.device.deviceId}</p>
            <div className="issued-key">{issuedKey.key}</div>
            <button className="btn primary wide" onClick={copyKey}><Copy size={14} /> Copy API key</button>
            <div className="key-instructions"><b>Send telemetry over HTTPS/HTTP:</b><pre>{`POST /api/ingest\nContent-Type: application/json\nX-Device-Key: ${issuedKey.key}\n\n{\n  "deviceId": "${issuedKey.device.deviceId}",\n  "metric": "temperature",\n  "value": 23.7\n}`}</pre><span className="muted small">Replace the example metric and reading with measurements from your actual sensor. Never commit this key to Git.</span></div>
            <div className="modal-actions"><button className="btn primary" onClick={() => setIssuedKey(null)}>I've saved the key</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
