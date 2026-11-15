import { useState } from 'react';
import { Workflow, Zap, GitBranch, Radio } from 'lucide-react';
import { api } from '../api';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = mode === 'login' ? await api.login(form) : await api.register(form);
      onAuth(res);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand big"><Workflow size={26} /> NexusFlow</div>
        <h1>Build IoT rules by drawing them.</h1>
        <p>Drag sensors, filters and alerts onto a canvas. NexusFlow compiles your graph into a live data stream and watches millions of telemetry points for you.</p>
        <ul>
          <li><GitBranch size={16} /> No-code visual logic builder</li>
          <li><Zap size={16} /> RxJS stream engine, evaluated in memory</li>
          <li><Radio size={16} /> Live dashboards over WebSockets</li>
        </ul>
      </div>
      <form className="login-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted">{mode === 'login' ? 'Sign in to your factory floor.' : 'It takes ten seconds.'}</p>
        {mode === 'register' && (
          <label>Name<input value={form.name} onChange={set('name')} placeholder="Plant manager" /></label>
        )}
        <label>Email<input type="email" required value={form.email} onChange={set('email')} placeholder="you@factory.com" /></label>
        <label>Password<input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="At least 6 characters" /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? "New here? Create an account" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
