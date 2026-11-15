const ingest = require('./ingest');
let timer = null;
let cfg = null;

const noise = (a) => (Math.random() - 0.5) * 2 * a;

/** Mock turbine fleet: temperature, vibration, rpm, with random overheating bursts. */
function start({ devices = 4, hz = 5, anomalyChance = 0.01 } = {}) {
  stop();
  devices = Math.min(Math.max(1, +devices || 4), 50);
  hz = Math.min(Math.max(1, +hz || 5), 50);
  cfg = { devices, hz };
  const burst = new Map();
  let t = 0;
  timer = setInterval(() => {
    t += 1 / hz;
    const now = Date.now();
    const pts = [];
    for (let i = 0; i < devices; i++) {
      const id = `turbine-${i + 1}`;
      let left = burst.get(id) || 0;
      if (left <= 0 && Math.random() < anomalyChance) left = hz * 4;
      const hot = left > 0;
      burst.set(id, Math.max(0, left - 1));
      pts.push(
        { deviceId: id, metric: 'temperature', value: 68 + 7 * Math.sin(t / 8 + i) + noise(1.5) + (hot ? 22 : 0), timestamp: now },
        { deviceId: id, metric: 'vibration', value: 2.4 + 0.4 * Math.sin(t / 3 + i) + noise(0.15) + (hot ? 1.6 : 0), timestamp: now },
        { deviceId: id, metric: 'rpm', value: 3000 + 60 * Math.sin(t / 5 + i) + noise(15), timestamp: now },
      );
    }
    ingest.accept(pts);
  }, 1000 / hz);
  return status();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  return status();
}

const status = () => ({ running: !!timer, config: timer ? cfg : null });
module.exports = { start, stop, status };
