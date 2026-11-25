/**
 * High-throughput ingestion: validate -> buffer -> batched insertMany into the
 * time-series collection, while simultaneously feeding the rule engine.
 */
const engine = require('./engine');
const { EventEmitter } = require('events');
const events = new EventEmitter();

let collection = null;
const buffer = [];
const MAX_BUFFER = 250000;
const CHUNK = 10000;
const devices = new Map();
const liveLatest = new Map();
const counters = { total: 0, persisted: 0, failed: 0, dropped: 0, rejected: 0 };
let secCount = 0;
let writesPerSec = 0;
let flushing = false;

setInterval(() => { writesPerSec = secCount; secCount = 0; }, 1000).unref();

const expand = (raw) => {
  if (raw && typeof raw.readings === 'object' && raw.readings) {
    return Object.entries(raw.readings).map(([metric, value]) => ({ deviceId: raw.deviceId, metric, value, timestamp: raw.timestamp }));
  }
  return [raw];
};

function normalize(raw) {
  if (!raw) return null;
  const deviceId = String(raw.deviceId ?? '').trim();
  const metric = String(raw.metric ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(deviceId)) return null;
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(metric)) return null;
  if (raw.value === '' || raw.value === null || raw.value === undefined) return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value)) return null;
  const hasTimestamp = raw.timestamp !== undefined && raw.timestamp !== null && raw.timestamp !== '';
  const parsed = hasTimestamp ? new Date(raw.timestamp).getTime() : Date.now();
  if (!Number.isFinite(parsed)) return null;
  return { deviceId, metric, value, ts: parsed };
}

function accept(rawInput) {
  const list = Array.isArray(rawInput) ? rawInput : [rawInput];
  const points = [];
  let rejected = 0;
  for (const item of list) {
    for (const r of expand(item)) {
      const p = normalize(r);
      if (!p) { rejected++; continue; }
      points.push(p);
    }
  }
  for (const p of points) {
    const dev = devices.get(p.deviceId) || { deviceId: p.deviceId, metrics: {}, lastSeen: 0 };
    dev.metrics[p.metric] = { value: p.value, ts: p.ts };
    dev.lastSeen = Date.now();
    devices.set(p.deviceId, dev);
    liveLatest.set(`${p.deviceId}|${p.metric}`, p);
    buffer.push(p);
  }
  if (buffer.length > MAX_BUFFER) {
    const over = buffer.length - MAX_BUFFER;
    buffer.splice(0, over);
    counters.dropped += over;
  }
  counters.total += points.length;
  if (points.length) events.emit('accepted', points);
  counters.rejected += rejected;
  secCount += points.length;
  engine.ingest(points);
  return { accepted: points.length, rejected };
}

async function flush() {
  if (flushing || !collection || !buffer.length) return;
  flushing = true;
  try {
    while (buffer.length) {
      const chunk = buffer.splice(0, CHUNK).map((p) => ({
        timestamp: new Date(p.ts), meta: { deviceId: p.deviceId, metric: p.metric }, value: p.value,
      }));
      try {
        await collection.insertMany(chunk, { ordered: false });
        counters.persisted += chunk.length;
      } catch (e) {
        counters.failed += chunk.length;
        console.error('[ingest] insert failed:', e.message);
      }
    }
  } finally { flushing = false; }
}

async function init(col) {
  collection = col;
  setInterval(flush, 250).unref();
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const rows = await col.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: { d: '$meta.deviceId', m: '$meta.metric' } } },
    ]).toArray();
    for (const r of rows) {
      const dev = devices.get(r._id.d) || { deviceId: r._id.d, metrics: {}, lastSeen: 0 };
      dev.metrics[r._id.m] = dev.metrics[r._id.m] || { value: null, ts: 0 };
      devices.set(r._id.d, dev);
    }
  } catch (e) { console.warn('[ingest] device seed skipped:', e.message); }
}

const drainLive = () => { const out = [...liveLatest.values()]; liveLatest.clear(); return out; };
const listDevices = () => [...devices.values()];
const stats = () => ({ ...counters, writesPerSec, buffered: buffer.length, devices: devices.size });

module.exports = { init, accept, flush, drainLive, listDevices, stats, events, getCollection: () => collection };
