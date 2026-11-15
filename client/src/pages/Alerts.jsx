import { useState } from 'react';
import { MessageSquare, Webhook, Trash2, BellOff } from 'lucide-react';
import { api } from '../api';
import { useLive } from '../LiveContext';
import { useToast } from '../Toast';

export default function Alerts() {
  const { alerts, setAlerts } = useLive();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const list = alerts.filter((a) => filter === 'all' || a.status === filter);

  const clear = async () => {
    if (!window.confirm('Clear the entire alert history?')) return;
    try { await api.clearAlerts(); setAlerts([]); toast('Alert history cleared', 'info'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="scroll-page">
      <div className="page-head">
        <div><h2>Alert history</h2><p className="muted">Every SMS and webhook your rules have triggered, newest first.</p></div>
        <div className="head-actions">
          <div className="seg compact">
            {['all', 'sent', 'failed'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
          </div>
          <button className="btn ghost" onClick={clear} disabled={!alerts.length}><Trash2 size={14} /> Clear</button>
        </div>
      </div>
      {!list.length ? (
        <div className="card empty-card"><BellOff size={28} /><h3>No alerts yet</h3><p className="muted">Deploy a rule and start the simulator on the dashboard. Alerts appear here the moment a rule fires.</p></div>
      ) : (
        <div className="card table-card">
          <table>
            <thead><tr><th>Time</th><th>Rule</th><th>Channel</th><th>Message</th><th>Device</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a._id || a.createdAt + a.nodeId}>
                  <td className="mono">{new Date(a.createdAt).toLocaleTimeString()}</td>
                  <td>{a.graphName}</td>
                  <td><span className="chan">{a.channel === 'sms' ? <MessageSquare size={13} /> : <Webhook size={13} />} {a.channel === 'sms' ? 'SMS' : 'Webhook'}</span></td>
                  <td className="msg">{a.message}</td>
                  <td className="mono">{a.deviceId}</td>
                  <td className="mono">{typeof a.value === 'number' ? a.value.toFixed(2) : '—'}</td>
                  <td><span className={`pill ${a.status === 'sent' ? 'ok' : 'bad'}`} title={a.detail}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
