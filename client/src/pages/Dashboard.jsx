import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Gauge, Database, HardDrive, Layers, Workflow, Cpu, Play, Square, Radio } from 'lucide-react';
import { api } from '../api';
import { useLive } from '../LiveContext';
import { useToast } from '../Toast';

const COLORS = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#fb923c', '#60a5fa', '#f87171'];
const num = (n) => (n == null ? '—' : new Intl.NumberFormat().format(Math.round(n)));
const bytes = (n) => (n == null ? '—' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export default function Dashboard() {
  const { series, devices, stats, connected } = useLive();
  const toast = useToast();
  const [sim, setSim] = useState({ running: false });
  const [cfg, setCfg] = useState({ devices: 4, hz: 5 });
  const [metric, setMetric] = useState('temperature');
  const [storage, setStorage] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => {
    api.simulator().then((s) => { setSim(s); if (s.config) setCfg(s.config); }).catch(() => {});
    const poll = () => api.stats().then((s) => setStorage(s.storage)).catch(() => {});
    poll();
    const a = setInterval(poll, 5000);
    const b = setInterval(() => tick((x) => x + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const deviceIds = useMemo(() => Object.keys(devices).sort(natural), [devices]);
  const metrics = useMemo(() => [...new Set(Object.values(devices).flatMap((d) => Object.keys(d.metrics)))].sort(), [devices]);
  useEffect(() => { if (metrics.length && !metrics.includes(metric)) setMetric(metrics[0]); }, [metrics, metric]);

  const { rows, lines } = useMemo(() => {
    const map = new Map(); const ids = [];
    for (const id of deviceIds) {
      const arr = series[`${id}|${metric}`];
      if (!arr || ids.length >= 8) continue;
      ids.push(id);
      for (const p of arr) { const t = Math.round(p.t / 500) * 500; const row = map.get(t) || { t }; row[id] = +p.v.toFixed(2); map.set(t, row); }
    }
    return { rows: [...map.values()].sort((a, b) => a.t - b.t).slice(-100), lines: ids };
  }, [series, metric, deviceIds]);

  const hasDashboardData = deviceIds.length > 0 || rows.length > 0 || (stats?.total ?? 0) > 0;

  const toggleSim = async () => {
    try { setSim(sim.running ? await api.stopSim() : await api.startSim(cfg)); } catch (e) { toast(e.message, 'error'); }
  };

  const cards = [
    { icon: Gauge, label: 'Writes / sec', value: num(stats?.writesPerSec), tone: 'cyan' },
    { icon: Database, label: 'Total ingested', value: num(stats?.total), tone: 'violet' },
    { icon: Layers, label: 'Persisted to MongoDB', value: num(stats?.persisted), sub: stats?.buffered ? `${num(stats.buffered)} buffered` : 'buffer empty', tone: 'green' },
    { icon: HardDrive, label: 'Storage footprint', value: bytes(storage?.storageSize), sub: storage?.bytesPerPoint ? `${storage.bytesPerPoint} B / point` : 'time-series compressed', tone: 'amber' },
    { icon: Workflow, label: 'Active rules', value: stats?.rules ?? 0, tone: 'pink' },
    { icon: Cpu, label: 'Devices seen', value: stats?.devices ?? deviceIds.length, tone: 'blue' },
  ];

  return (
    <div className="scroll-page">
      <div className="page-head">
        <div><h2>Live dashboard</h2><p className="muted">Streaming over WebSockets {connected ? '' : '(reconnecting…)'}</p></div>
        <div className="sim">
          <Radio size={15} className={sim.running ? 'pulse' : ''} />
          <label>Devices<input type="number" min={1} max={50} value={cfg.devices} disabled={sim.running} onChange={(e) => setCfg({ ...cfg, devices: +e.target.value })} /></label>
          <label>Rate (Hz)<input type="number" min={1} max={50} value={cfg.hz} disabled={sim.running} onChange={(e) => setCfg({ ...cfg, hz: +e.target.value })} /></label>
          <button className={`btn ${sim.running ? 'danger' : 'primary'}`} onClick={toggleSim}>{sim.running ? <><Square size={13} /> Stop simulator</> : <><Play size={13} /> Start simulator</>}</button>
        </div>
      </div>

      {!hasDashboardData ? (
        <div className="card empty-card dashboard-empty">
          <Radio size={28} />
          <h3>{sim.running ? 'Waiting for telemetry' : 'No dashboard data yet'}</h3>
          <p>{sim.running
            ? 'The simulator is running, but no readings have arrived yet. Check the live connection status above.'
            : <>Start the simulator to generate live readings, or connect a device and send data to <code>/api/ingest</code>.</>}</p>
          <button className={`btn ${sim.running ? 'danger' : 'primary'}`} onClick={toggleSim}>
            {sim.running ? <><Square size={13} /> Stop simulator</> : <><Play size={13} /> Start simulator</>}
          </button>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            {cards.map(({ icon: I, label, value, sub, tone }) => (
              <div key={label} className={`card stat ${tone}`}>
                <span className="stat-icon"><I size={17} /></span>
                <div><small>{label}</small><b>{value}</b>{sub && <em>{sub}</em>}</div>
              </div>
            ))}
          </div>

          <div className="card chart-card">
            <div className="card-head">
              <h3>Telemetry by device</h3>
              <div className="seg compact">
                {metrics.map((m) => <button key={m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{m}</button>)}
              </div>
            </div>
            {!rows.length ? (
              <div className="chart-empty"><Radio size={26} /><p>No data yet. Press <b>Start simulator</b> or POST readings to <code>/api/ingest</code>.</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2a47" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })} stroke="#5b6b8c" fontSize={11} minTickGap={40} />
                  <YAxis stroke="#5b6b8c" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #26324f', borderRadius: 10, fontSize: 12 }} labelFormatter={(t) => new Date(t).toLocaleTimeString()} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {lines.map((id, i) => <Line key={id} type="monotone" dataKey={id} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Devices</h3><span className="muted small">{deviceIds.length} total</span></div>
            {!deviceIds.length ? <p className="muted">No devices have reported yet.</p> : (
              <div className="device-grid">
                {deviceIds.slice(0, 24).map((id) => {
                  const d = devices[id];
                  const online = d.lastSeen && Date.now() - d.lastSeen < 5000;
                  return (
                    <div key={id} className="device">
                      <div className="device-head"><b>{id}</b><span className={`pill ${online ? 'ok' : 'muted-pill'}`}>{online ? 'online' : 'idle'}</span></div>
                      {Object.entries(d.metrics).map(([m, v]) => (
                        <div key={m} className="kv"><span>{m}</span><b>{v.value == null ? '—' : v.value.toFixed(m === 'rpm' ? 0 : 2)}</b></div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {deviceIds.length > 24 && <p className="muted small">+{deviceIds.length - 24} more devices not shown.</p>}
          </div>
        </>
      )}
    </div>
  );
}
