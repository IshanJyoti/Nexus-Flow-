const mongoose = require('mongoose');
const { Schema } = mongoose;

const User = mongoose.model('User', new Schema({
  name: String,
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));

const Graph = mongoose.model('Graph', new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, default: 'Untitled rule' },
  nodes: { type: Schema.Types.Mixed, default: [] },
  edges: { type: Schema.Types.Mixed, default: [] },
  active: { type: Boolean, default: false },
}, { timestamps: true }));

const Alert = mongoose.model('Alert', new Schema({
  graphId: String,
  graphName: String,
  nodeId: String,
  channel: { type: String, enum: ['sms', 'webhook'] },
  message: String,
  status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
  detail: String,
  deviceId: String,
  metric: String,
  value: Number,
}, { timestamps: true }));

/** Native time-series collection (MongoDB 5.0+). Created once, append-only. */
async function ensureTelemetryCollection(db, retentionDays) {
  const exists = await db.listCollections({ name: 'telemetry' }).hasNext();
  if (!exists) {
    await db.createCollection('telemetry', {
      timeseries: { timeField: 'timestamp', metaField: 'meta', granularity: 'seconds' },
      expireAfterSeconds: retentionDays * 86400,
    });
    console.log('[db] created time-series collection "telemetry"');
  }
  return db.collection('telemetry');
}

module.exports = { User, Graph, Alert, ensureTelemetryCollection };
