import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api';

const Ctx = createContext(null);
export const useLive = () => useContext(Ctx);
const MAX_POINTS = 120;

/** One WebSocket powers everything live: telemetry, node activity (wire glow), alerts, stats. */
export function LiveProvider({ token, children }) {
  const [connected, setConnected] = useState(false);
  const [series, setSeries] = useState({});
  const [devices, setDevices] = useState({});
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [lastAlert, setLastAlert] = useState(null);
  const [glow, setGlow] = useState(() => new Set());
  const [nodeValues, setNodeValues] = useState({});
  const handlerRef = useRef(() => {});

  handlerRef.current = (msg) => {
    const { type, data } = msg;
    if (type === 'telemetry') {
      setSeries((prev) => {
        const next = { ...prev };
        for (const p of data) {
          const k = `${p.deviceId}|${p.metric}`;
          const arr = (next[k] || []).concat({ t: p.ts, v: p.value });
          next[k] = arr.length > MAX_POINTS ? arr.slice(-MAX_POINTS) : arr;
        }
        return next;
      });
      setDevices((prev) => {
        const next = { ...prev };
        for (const p of data) {
          const d = next[p.deviceId] || { deviceId: p.deviceId, metrics: {} };
          next[p.deviceId] = { ...d, lastSeen: Date.now(), metrics: { ...d.metrics, [p.metric]: { value: p.value, ts: p.ts } } };
        }
        return next;
      });
    } else if (type === 'fires') {
      const ids = data.map((f) => f.nodeId);
      setNodeValues((prev) => { const n = { ...prev }; data.forEach((f) => { n[f.nodeId] = f.value; }); return n; });
      setGlow((prev) => new Set([...prev, ...ids]));
      setTimeout(() => setGlow((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; }), 900);
    } else if (type === 'alert') {
      setAlerts((prev) => [data, ...prev].slice(0, 300));
      setLastAlert({ ...data, _k: Date.now() });
    } else if (type === 'stats') {
      setStats(data);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    api.devices().then((list) => setDevices(Object.fromEntries(list.map((d) => [d.deviceId, d])))).catch(() => {});
    api.alerts().then(setAlerts).catch(() => {});
    let ws; let stop = false; let retry;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (!stop) retry = setTimeout(connect, 2000); };
      ws.onmessage = (e) => { try { handlerRef.current(JSON.parse(e.data)); } catch { /* ignore */ } };
    };
    connect();
    return () => { stop = true; clearTimeout(retry); if (ws) ws.close(); };
  }, [token]);

  const resetNodeValues = useCallback(() => setNodeValues({}), []);

  return (
    <Ctx.Provider value={{ connected, series, devices, stats, alerts, setAlerts, lastAlert, glow, nodeValues, resetNodeValues }}>
      {children}
    </Ctx.Provider>
  );
}
