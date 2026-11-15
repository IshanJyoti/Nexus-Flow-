import { useEffect, useState } from 'react';
import { api, getToken } from './api';
import { LiveProvider, useLive } from './LiveContext';
import { ToastProvider, useToast } from './Toast';
import Login from './components/Login';
import Topbar from './components/Topbar';
import Builder from './pages/Builder';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';

function Shell({ user, onLogout }) {
  const [tab, setTab] = useState('builder');
  const { lastAlert } = useLive();
  const toast = useToast();

  useEffect(() => {
    if (lastAlert) toast(`${lastAlert.channel === 'sms' ? 'SMS' : 'Webhook'} fired · ${lastAlert.message}`, lastAlert.status === 'failed' ? 'error' : 'alert', 6000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAlert?._k]);

  return (
    <div className="app">
      <Topbar tab={tab} setTab={setTab} user={user} onLogout={onLogout} />
      <main>
        {/* Builder stays mounted so your canvas isn't lost when switching tabs */}
        <div className="page" hidden={tab !== 'builder'}><Builder /></div>
        {tab === 'dashboard' && <div className="page"><Dashboard /></div>}
        {tab === 'alerts' && <div className="page"><Alerts /></div>}
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    api.me().then((r) => setUser(r.user)).catch(() => { localStorage.removeItem('nf_token'); setToken(null); }).finally(() => setChecking(false));
  }, [token]);

  const onAuth = ({ token: t, user: u }) => { localStorage.setItem('nf_token', t); setUser(u); setToken(t); };
  const onLogout = () => { localStorage.removeItem('nf_token'); setToken(null); setUser(null); };

  if (checking) return <div className="splash">Loading NexusFlow…</div>;
  return (
    <ToastProvider>
      {!token ? <Login onAuth={onAuth} /> : (
        <LiveProvider token={token}>
          <Shell user={user} onLogout={onLogout} />
        </LiveProvider>
      )}
    </ToastProvider>
  );
}
