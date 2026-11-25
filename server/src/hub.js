const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const crypto = require('crypto');
const { Device } = require('./models');
const engine = require('./engine');
const ingest = require('./ingest');

/** WebSocket hub: authenticated dashboards receive live data; devices may stream telemetry in. */
function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map();

  wss.on('connection', (ws, req) => {
    const q = new URL(req.url, 'http://localhost').searchParams;
    let role = null;
    let deviceId = null;
    let clientUserId = null;
    if (q.get('token')) { try { const claims = jwt.verify(q.get('token'), config.jwtSecret); role = 'client'; clientUserId = String(claims.id); } catch { /* ignore */ } }
    if (!role && config.ingestKey && q.get('key') === config.ingestKey) role = 'device-global';
    if (!role && q.get('deviceKey')) {
      const hash = crypto.createHash('sha256').update(q.get('deviceKey')).digest('hex');
      Device.findOne({ apiKeyHash: hash }).then((device) => {
        if (!device || ws.readyState !== 1) return ws.close(4401, 'unauthorized');
        attachDeviceSocket(device);
      }).catch(() => ws.close(1011, 'authentication failed'));
      return;
    }
    if (!role) return ws.close(4401, 'unauthorized');

    function attachDeviceSocket(device) {
      role = 'device';
      deviceId = device?.deviceId || null;
      attachHandlers();
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ready', role: 'device', deviceId }));
    }
    function attachHandlers() {
      if (role === 'client') clients.set(ws, clientUserId);
      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type === 'telemetry') {
          const payload = msg.data;
          const items = Array.isArray(payload) ? payload : [payload];
          if (role === 'device' && items.some((item) => String(item?.deviceId || '') !== deviceId)) {
            if (msg.ack) ws.send(JSON.stringify({ type: 'ack', accepted: 0, rejected: items.length, error: 'Device key mismatch' }));
            return;
          }
          const res = ingest.accept(payload);
          if (msg.ack) ws.send(JSON.stringify({ type: 'ack', ...res }));
        }
      });
    }
    if (role === 'device-global') role = 'device-global';
    attachHandlers();
  });

  const send = (type, data) => {
    if (!clients.size) return;
    const payload = JSON.stringify({ type, data });
    for (const c of clients.keys()) if (c.readyState === 1) c.send(payload);
  };

  // Coalesce node activity so the canvas can "glow" without flooding the socket.
  const fires = new Map();
  engine.on('fire', (f) => fires.set(`${f.graphId}:${f.nodeId}`, f));
  engine.on('alert', (a) => send('alert', a));

  setInterval(async () => {
    const live = ingest.drainLive();
    if (!live.length || !clients.size) return;
    try {
      const ids = [...new Set(live.map((point) => point.deviceId))];
      const registered = await Device.find({ deviceId: { $in: ids }, active: true }).select('deviceId owner').lean();
      const ownerByDevice = new Map(registered.map((device) => [device.deviceId, String(device.owner)]));
      for (const [client, userId] of clients) {
        if (client.readyState !== 1) continue;
        const ownedPoints = live.filter((point) => ownerByDevice.get(point.deviceId) === userId);
        if (ownedPoints.length) client.send(JSON.stringify({ type: 'telemetry', data: ownedPoints }));
      }
    } catch (error) {
      console.error('[ws] could not route telemetry by device owner:', error.message);
    }
  }, 250).unref();
  setInterval(() => {
    if (fires.size) { send('fires', [...fires.values()]); fires.clear(); }
  }, 150).unref();
  setInterval(() => send('stats', { ...ingest.stats(), clients: clients.size, rules: engine.deployed.size }), 1000).unref();

  return { clientCount: () => clients.size };
}

module.exports = { attach };
