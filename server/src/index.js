const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const { Graph, Device, ensureTelemetryCollection } = require('./models');
const engine = require('./engine');
const ingest = require('./ingest');
const hub = require('./hub');
const api = require('./api');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('[db] connected');
  const telemetry = await ensureTelemetryCollection(mongoose.connection.db, config.retentionDays);
  await ingest.init(telemetry);
  ingest.events.on('accepted', (points) => {
    const latest = new Map();
    for (const point of points) {
      const previous = latest.get(point.deviceId) || 0;
      if (point.ts > previous) latest.set(point.deviceId, point.ts);
    }
    if (!latest.size) return;
    Device.bulkWrite([...latest].map(([deviceId, timestamp]) => ({
      updateOne: {
        filter: { deviceId, active: true },
        update: { $max: { lastSeen: new Date(timestamp) } },
      },
    })), { ordered: false }).catch((error) => console.error('[devices] last-seen update failed:', error.message));
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', api);

  const dist = path.join(__dirname, '../../client/dist'); // serve the built UI in production
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const server = http.createServer(app);
  hub.attach(server);

  for (const g of await Graph.find({ active: true })) { // resume rules after restart
    try { engine.deploy(g.toObject()); console.log(`[engine] resumed rule "${g.name}"`); }
    catch (e) { console.warn(`[engine] could not resume "${g.name}": ${e.message}`); }
  }

  server.listen(config.port, () => console.log(`NexusFlow API + WebSocket on http://localhost:${config.port}`));

  const shutdown = async () => { await ingest.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
