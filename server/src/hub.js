const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const engine = require('./engine');
const ingest = require('./ingest');

/** WebSocket hub: authenticated dashboards receive live data; devices may stream telemetry in. */
function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();

  wss.on('connection', (ws, req) => {
    const q = new URL(req.url, 'http://localhost').searchParams;
    let role = null;
    if (q.get('token')) { try { jwt.verify(q.get('token'), config.jwtSecret); role = 'client'; } catch { /* ignore */ } }
    if (!role && config.ingestKey && q.get('key') === config.ingestKey) role = 'device';
    if (!role && !config.ingestKey && q.get('device') === '1') role = 'device';
    if (!role) return ws.close(4401, 'unauthorized');

    if (role === 'client') clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'telemetry') {
        const res = ingest.accept(msg.data);
        if (msg.ack) ws.send(JSON.stringify({ type: 'ack', ...res }));
      }
    });
  });

  const send = (type, data) => {
    if (!clients.size) return;
    const payload = JSON.stringify({ type, data });
    for (const c of clients) if (c.readyState === 1) c.send(payload);
  };

  // Coalesce node activity so the canvas can "glow" without flooding the socket.
  const fires = new Map();
  engine.on('fire', (f) => fires.set(`${f.graphId}:${f.nodeId}`, f));
  engine.on('alert', (a) => send('alert', a));

  setInterval(() => {
    const live = ingest.drainLive();
    if (live.length) send('telemetry', live);
  }, 250).unref();
  setInterval(() => {
    if (fires.size) { send('fires', [...fires.values()]); fires.clear(); }
  }, 150).unref();
  setInterval(() => send('stats', { ...ingest.stats(), clients: clients.size, rules: engine.deployed.size }), 1000).unref();

  return { clientCount: () => clients.size };
}

module.exports = { attach };
