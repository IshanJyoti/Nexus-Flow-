const { Alert } = require('./models');
const lastFired = new Map();

const render = (tpl, ev) =>
  String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    k === 'value' ? Number(ev.value).toFixed(2) : (ev[k] ?? ''));

/** Executes an action node (mock SMS / outbound webhook) with a per-node cooldown. */
async function run({ graph, node, ev }) {
  const d = node.data || {};
  const key = `${graph.id}:${node.id}`;
  const cooldown = d.cooldownMs !== '' && d.cooldownMs != null && Number.isFinite(+d.cooldownMs) ? +d.cooldownMs : 10000;
  const now = Date.now();
  if (now - (lastFired.get(key) || 0) < cooldown) return null;
  lastFired.set(key, now);

  const message = render(d.message || 'NexusFlow alert: {{metric}} on {{deviceId}} = {{value}}', ev);
  let status = 'sent';
  let detail = '';

  if (node.type === 'sms') {
    console.log(`[SMS -> ${d.phone}] ${message}`); // swap in Twilio / MSG91 here
    detail = `Mock SMS delivered to ${d.phone}`;
  } else {
    const method = (d.method || 'POST').toUpperCase();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(d.url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({
          rule: graph.name, node: node.id, message,
          deviceId: ev.deviceId, metric: ev.metric, value: ev.value,
          timestamp: new Date(ev.ts).toISOString(),
        }),
        signal: ctrl.signal,
      });
      detail = `HTTP ${res.status}`;
      if (!res.ok) status = 'failed';
    } catch (e) {
      status = 'failed';
      detail = e.name === 'AbortError' ? 'Timed out after 5s' : e.message;
    } finally { clearTimeout(timer); }
  }

  const doc = await Alert.create({
    graphId: graph.id, graphName: graph.name, nodeId: node.id, channel: node.type,
    message, status, detail, deviceId: ev.deviceId, metric: ev.metric, value: ev.value,
  });
  return doc.toObject();
}

module.exports = { run };
