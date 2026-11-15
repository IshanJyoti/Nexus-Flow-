const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('./config');
const { User, Graph, Alert } = require('./models');
const { validate } = require('./compiler');
const engine = require('./engine');
const ingest = require('./ingest');
const simulator = require('./simulator');

const router = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error('[api]', e);
  res.status(500).json({ error: e.message || 'Server error' });
});

const sign = (u) => jwt.sign({ id: u.id, email: u.email }, config.jwtSecret, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', config.jwtSecret);
    next();
  } catch { res.status(401).json({ error: 'Please sign in again.' }); }
}

/* ---------- auth ---------- */
router.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Email and a 6+ character password are required.' });
  if (await User.findOne({ email: String(email).toLowerCase() })) return res.status(409).json({ error: 'That email is already registered.' });
  const user = await User.create({ name: name || email.split('@')[0], email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/auth/me', auth, wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: publicUser(user) });
}));

/* ---------- ingestion (device API key OR dashboard JWT) ---------- */
function ingestAuth(req, res, next) {
  if (!config.ingestKey) return next();
  if (req.headers['x-api-key'] === config.ingestKey) return next();
  return auth(req, res, next);
}
router.post('/ingest', ingestAuth, (req, res) => {
  const body = req.body;
  const payload = Array.isArray(body?.points) ? body.points : body;
  if (!payload || (typeof payload !== 'object')) return res.status(400).json({ error: 'Send a reading or an array of readings.' });
  res.status(202).json(ingest.accept(payload));
});

/* ---------- graphs ---------- */
const cleanGraph = (g) => ({
  id: g.id, name: g.name, nodes: g.nodes, edges: g.edges, active: engine.isDeployed(g.id),
  updatedAt: g.updatedAt, createdAt: g.createdAt,
});

router.post('/graphs/validate', auth, (req, res) => res.json(validate(req.body)));

router.get('/graphs', auth, wrap(async (req, res) => {
  const list = await Graph.find({ owner: req.user.id }).sort({ updatedAt: -1 });
  res.json(list.map(cleanGraph));
}));

router.post('/graphs', auth, wrap(async (req, res) => {
  const { name, nodes = [], edges = [] } = req.body || {};
  const g = await Graph.create({ owner: req.user.id, name: name || 'Untitled rule', nodes, edges });
  res.status(201).json(cleanGraph(g));
}));

router.put('/graphs/:id', auth, wrap(async (req, res) => {
  const g = await Graph.findOne({ _id: req.params.id, owner: req.user.id });
  if (!g) return res.status(404).json({ error: 'Rule not found.' });
  const { name, nodes, edges } = req.body || {};
  if (name !== undefined) g.name = name;
  if (nodes !== undefined) g.nodes = nodes;
  if (edges !== undefined) g.edges = edges;
  g.markModified('nodes'); g.markModified('edges');
  let warning;
  if (engine.isDeployed(g.id)) { // hot-reload a running rule
    try { engine.deploy(g.toObject()); } catch (e) { engine.undeploy(g.id); g.active = false; warning = `Rule was stopped: ${e.message}`; }
  }
  await g.save();
  res.json({ ...cleanGraph(g), warning });
}));

router.delete('/graphs/:id', auth, wrap(async (req, res) => {
  const g = await Graph.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
  if (!g) return res.status(404).json({ error: 'Rule not found.' });
  engine.undeploy(g.id);
  res.json({ ok: true });
}));

router.post('/graphs/:id/deploy', auth, wrap(async (req, res) => {
  const g = await Graph.findOne({ _id: req.params.id, owner: req.user.id });
  if (!g) return res.status(404).json({ error: 'Rule not found.' });
  const { errors, warnings } = validate(g);
  if (errors.length) return res.status(422).json({ error: 'Fix these issues before deploying.', errors, warnings });
  engine.deploy(g.toObject());
  g.active = true;
  await g.save();
  res.json({ ok: true, warnings, graph: cleanGraph(g) });
}));

router.post('/graphs/:id/undeploy', auth, wrap(async (req, res) => {
  const g = await Graph.findOne({ _id: req.params.id, owner: req.user.id });
  if (!g) return res.status(404).json({ error: 'Rule not found.' });
  engine.undeploy(g.id);
  g.active = false;
  await g.save();
  res.json({ ok: true, graph: cleanGraph(g) });
}));

/* ---------- telemetry, devices, alerts, stats ---------- */
router.get('/devices', auth, (req, res) => res.json(ingest.listDevices()));

router.get('/telemetry', auth, wrap(async (req, res) => {
  const col = ingest.getCollection();
  if (!col) return res.json([]);
  const minutes = Math.min(+req.query.minutes || 15, 1440);
  const limit = Math.min(+req.query.limit || 500, 5000);
  const q = { timestamp: { $gte: new Date(Date.now() - minutes * 60000) } };
  if (req.query.deviceId) q['meta.deviceId'] = String(req.query.deviceId);
  if (req.query.metric) q['meta.metric'] = String(req.query.metric);
  const rows = await col.find(q).sort({ timestamp: -1 }).limit(limit).toArray();
  res.json(rows.map((r) => ({ t: r.timestamp, deviceId: r.meta.deviceId, metric: r.meta.metric, v: r.value })).reverse());
}));

router.get('/alerts', auth, wrap(async (req, res) => {
  res.json(await Alert.find().sort({ createdAt: -1 }).limit(Math.min(+req.query.limit || 100, 500)).lean());
}));
router.delete('/alerts', auth, wrap(async (req, res) => { await Alert.deleteMany({}); res.json({ ok: true }); }));

router.get('/stats', auth, wrap(async (req, res) => {
  let storage = null;
  try {
    const s = await mongoose.connection.db.command({ collStats: 'telemetry' });
    const measurements = s.timeseries?.numMeasurementsCommitted ?? null;
    storage = {
      storageSize: s.storageSize, indexSize: s.totalIndexSize, measurements,
      bytesPerPoint: measurements ? +((s.storageSize + s.totalIndexSize) / measurements).toFixed(2) : null,
    };
  } catch { /* collStats unavailable */ }
  res.json({ ...ingest.stats(), rules: engine.deployed.size, storage });
}));

/* ---------- simulator ---------- */
router.get('/simulator', auth, (req, res) => res.json(simulator.status()));
router.post('/simulator/start', auth, (req, res) => res.json(simulator.start(req.body || {})));
router.post('/simulator/stop', auth, (req, res) => res.json(simulator.stop()));

router.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

module.exports = router;
