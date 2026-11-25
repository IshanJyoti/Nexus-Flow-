/**
 * Mid-project audit helper: pushes N telemetry points/sec at /api/ingest in batches.
 *   node scripts/loadtest.js --rate 5000 --seconds 20 --devices 50
 * Then watch "Writes / sec" on the Live Dashboard, or GET /api/stats.
 */
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const rate = +arg('rate', 5000);
const seconds = +arg('seconds', 20);
const devices = +arg('devices', 50);
const url = arg('url', 'http://localhost:5000/api/ingest');
const key = process.env.INGEST_KEY || '';

const TICK_MS = 100;
const perTick = Math.round(rate * (TICK_MS / 1000));
let sent = 0;
let failed = 0;
const started = Date.now();

const tick = async () => {
  const now = Date.now();
  const batch = Array.from({ length: perTick }, (_, i) => ({
    deviceId: `load-${i % devices}`, metric: ['temperature', 'vibration', 'rpm'][i % 3],
    value: 50 + Math.random() * 50, timestamp: now,
  }));
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify(batch) });
    if (res.ok) sent += perTick; else failed += perTick;
  } catch { failed += perTick; }
};

const timer = setInterval(tick, TICK_MS);
setTimeout(() => {
  clearInterval(timer);
  const secs = (Date.now() - started) / 1000;
  console.log(`Sent ${sent} points in ${secs.toFixed(1)}s -> ${(sent / secs).toFixed(0)} pts/sec (failed: ${failed})`);
  process.exit(0);
}, seconds * 1000);
console.log(`Load test: ${rate} pts/sec for ${seconds}s -> ${url}`);
