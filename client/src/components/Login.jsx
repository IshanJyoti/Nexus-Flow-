import { useState } from 'react';
import { Workflow, Zap, GitBranch, Radio } from 'lucide-react';
import { api } from '../api';

function authErrorMessage(error, mode) {
  if (!error.status) return 'Unable to reach the server. Check your connection and try again.';
  if (mode === 'login' && error.status === 401) return 'Email or password is incorrect. Check your details and try again.';
  if (mode === 'register' && error.status === 409) return 'An account with this email already exists. Sign in or use a different email.';
  if (error.status >= 500) return 'The server couldn’t complete your request. Please try again later.';
  return error.message || 'We couldn’t complete your request. Please try again.';
}

export default function Login({ onAuth, notice = '' }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((current) => ({ ...current, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const credentials = { ...form, email: form.email.trim().toLowerCase() };
      const res = mode === 'login' ? await api.login(credentials) : await api.register({ ...credentials, name: form.name.trim() });
      onAuth(res);
    } catch (err) { setError(authErrorMessage(err, mode)); } finally { setBusy(false); }
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
          <label>Name <span className="muted">(optional)</span><input autoComplete="name" value={form.name} onChange={set('name')} placeholder="Plant manager" /></label>
        )}
        <label>Email<input type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@factory.com" /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} value={form.password} onChange={set('password')} placeholder="At least 6 characters" /></label>
        {mode === 'register' && <p className="muted">Use a valid email address and a password with at least 6 characters.</p>}
        {notice && mode === 'login' && <div className="form-error" role="status">{notice}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? "New here? Create an account" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
