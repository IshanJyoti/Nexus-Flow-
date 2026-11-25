const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const config = require('./config');
const { User, Graph, Device, Alert } = require('./models');
const { validate } = require('./compiler');
const engine = require('./engine');
const ingest = require('./ingest');
const simulator = require('./simulator');

const router = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error('[api]', e);
  if (e.code === 11000) return res.status(409).json({ error: 'That device ID is already registered.' });
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

/* ---------- device provisioning and ingestion ---------- */
const hashDeviceKey = (key) => crypto.createHash('sha256').update(key).digest('hex');
const createDeviceKey = () => `nxf_${crypto.randomBytes(32).toString('hex')}`;
const cleanDevice = (device, metrics = {}) => ({
  id: device.id,
  deviceId: device.deviceId,
  name: device.name,
  description: device.description,
  location: device.location,
  apiKeyPrefix: device.apiKeyPrefix,
  lastSeen: device.lastSeen,
  status: device.lastSeen && Date.now() - new Date(device.lastSeen).getTime() <= 30000 ? 'online' : 'offline',
  metrics,
  createdAt: device.createdAt,
  updatedAt: device.updatedAt,
});

router.get('/devices', auth, wrap(async (req, res) => {
  const devices = await Device.find({ owner: req.user.id, active: true }).sort({ createdAt: -1 });
  const ids = devices.map((d) => d.deviceId);
  const metricsByDevice = {};
  const col = ingest.getCollection();
  if (ids.length && col) {
    const rows = await col.find({ 'meta.deviceId': { $in: ids } }).sort({ timestamp: -1 }).limit(5000).toArray();
    for (const row of rows) {
      const id = row.meta.deviceId;
      const metric = row.meta.metric;
      metricsByDevice[id] ||= {};
      if (!metricsByDevice[id][metric]) metricsByDevice[id][metric] = { value: row.value, timestamp: row.timestamp };
    }
  }
  res.json(devices.map((d) => cleanDevice(d, metricsByDevice[d.deviceId] || {})));
}));

router.post('/devices', auth, wrap(async (req, res) => {
  const { deviceId, name, description = '', location = '' } = req.body || {};
  const id = String(deviceId || '').trim();
  const label = String(name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(id)) {
    return res.status(400).json({ error: 'Device ID must be 2–64 characters and use letters, numbers, dots, underscores, colons or hyphens.' });
  }
  if (!label || label.length > 80) return res.status(400).json({ error: 'Device name is required and must be at most 80 characters.' });
  if (String(description).length > 500 || String(location).length > 120) return res.status(400).json({ error: 'Description or location is too long.' });
  const deviceKey = createDeviceKey();
  const device = await Device.create({
    owner: req.user.id,
    deviceId: id,
    name: label,
    description: String(description).trim(),
    location: String(location).trim(),
    apiKeyHash: hashDeviceKey(deviceKey),
    apiKeyPrefix: deviceKey.slice(0, 8),
  });
  res.status(201).json({ device: cleanDevice(device), deviceKey });
}));

router.patch('/devices/:id', auth, wrap(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, owner: req.user.id, active: true });
  if (!device) return res.status(404).json({ error: 'Device not found.' });
  const { name, description, location } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim() || String(name).trim().length > 80) return res.status(400).json({ error: 'Device name must be 1–80 characters.' });
    device.name = String(name).trim();
  }
  if (description !== undefined) {
    if (String(description).length > 500) return res.status(400).json({ error: 'Description must be at most 500 characters.' });
    device.description = String(description).trim();
  }
  if (location !== undefined) {
    if (String(location).length > 120) return res.status(400).json({ error: 'Location must be at most 120 characters.' });
    device.location = String(location).trim();
  }
  await device.save();
  res.json({ device: cleanDevice(device) });
}));

router.post('/devices/:id/rotate-key', auth, wrap(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, owner: req.user.id, active: true });
  if (!device) return res.status(404).json({ error: 'Device not found.' });
  const deviceKey = createDeviceKey();
  device.apiKeyHash = hashDeviceKey(deviceKey);
  device.apiKeyPrefix = deviceKey.slice(0, 8);
  await device.save();
  res.json({ device: cleanDevice(device), deviceKey });
}));

router.delete('/devices/:id', auth, wrap(async (req, res) => {
  const device = await Device.findOne({ _id: req.params.id, owner: req.user.id, active: true });
  if (!device) return res.status(404).json({ error: 'Device not found.' });
  device.active = false;
  device.apiKeyHash = hashDeviceKey(createDeviceKey());
  await device.save();
  res.json({ ok: true });
}));

async function ingestAuth(req, res, next) {
  const deviceKey = req.headers['x-device-key'];
  if (deviceKey) {
    try {
      const device = await Device.findOne({ apiKeyHash: hashDeviceKey(String(deviceKey)), active: true });
      if (!device) return res.status(401).json({ error: 'Invalid device key.' });
      req.ingestDevice = device;
      return next();
    } catch (e) { return res.status(500).json({ error: 'Could not authenticate device.' }); }
  }
  if (config.ingestKey && req.headers['x-api-key'] === config.ingestKey) {
    req.ingestGlobal = true;
    return next();
  }
  return auth(req, res, next);
}

router.post('/ingest', ingestAuth, wrap(async (req, res) => {
  const body = req.body;
  const payload = Array.isArray(body?.points) ? body.points : body;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Send a reading or an array of readings.' });
  const items = Array.isArray(payload) ? payload : [payload];
  const ids = [...new Set(items.map((item) => String(item?.deviceId || '').trim()).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: 'Every reading must include a registered deviceId.' });
  if (req.ingestDevice && ids.some((id) => id !== req.ingestDevice.deviceId)) {
    return res.status(403).json({ error: 'This device key can only send readings for its own deviceId.' });
  }
  if (req.user) {
    const owned = await Device.find({ owner: req.user.id, deviceId: { $in: ids } }).select('deviceId');
    const allowed = new Set(owned.map((d) => d.deviceId));
    const unknown = ids.filter((id) => !allowed.has(id));
    if (unknown.length) return res.status(403).json({ error: `Register these device IDs before sending telemetry: ${unknown.join(', ')}` });
  }
  res.status(202).json(ingest.accept(payload));
}));

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
