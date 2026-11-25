import { Workflow, LayoutDashboard, Bell, LogOut, Wifi, WifiOff, Cpu } from 'lucide-react';
import { useLive } from '../LiveContext';

const TABS = [
  { id: 'builder', label: 'Rule Builder', icon: Workflow },
  { id: 'dashboard', label: 'Live Dashboard', icon: LayoutDashboard },
  { id: 'devices', label: 'Devices', icon: Cpu },
  { id: 'alerts', label: 'Alerts', icon: Bell },
];

export default function Topbar({ tab, setTab, user, onLogout }) {
  const { connected, stats, alerts } = useLive();
  const failed = alerts.filter((a) => a.status === 'failed').length;
  return (
    <header className="topbar">
      <div className="brand"><Workflow size={20} /> NexusFlow</div>
      <nav>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={16} /> {label}
            {id === 'alerts' && alerts.length > 0 && <span className={`badge ${failed ? 'warn' : ''}`}>{alerts.length}</span>}
          </button>
        ))}
      </nav>
      <div className="top-right">
        <span className="pill muted-pill">{stats?.rules ?? 0} active rule{stats?.rules === 1 ? '' : 's'}</span>
        <span className={`pill ${connected ? 'ok' : 'bad'}`} role="status" aria-live="polite">
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span className="user">{user?.name || user?.email}</span>
        <button className="icon-btn" title="Sign out" onClick={onLogout}><LogOut size={16} /></button>
      </div>
    </header>
  );
}
