const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Device } = require('../src/models');
const config = require('../src/config');
const api = require('../src/api');

const tokenFor = (id) => jwt.sign({ id }, config.jwtSecret);

test('device routes cannot read, update, rotate or delete another user’s device', async (t) => {
  const originalFindOne = Device.findOne;
  const originalFindOneAndDelete = Device.findOneAndDelete;
  const ownerId = new mongoose.Types.ObjectId().toString();
  const otherOwnerId = new mongoose.Types.ObjectId().toString();
  const deviceId = new mongoose.Types.ObjectId().toString();
  const device = {
    _id: deviceId,
    owner: otherOwnerId,
    deviceId: 'plant-01',
    name: 'Other owner device',
    description: '',
    location: '',
    apiKeyPrefix: 'nxf_1234',
    lastSeen: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() { throw new Error('A foreign device must not be saved'); },
  };

  Device.findOne = async (query) => (
    String(query._id) === deviceId && String(query.owner) === otherOwnerId ? device : null
  );
  Device.findOneAndDelete = async () => null;

  const app = express();
  app.use(express.json());
  app.use('/api', api);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    Device.findOne = originalFindOne;
    Device.findOneAndDelete = originalFindOneAndDelete;
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { Authorization: `Bearer ${tokenFor(ownerId)}`, 'Content-Type': 'application/json' };
  const update = await fetch(`${base}/devices/${deviceId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: 'Unauthorized change' }),
  });
  assert.equal(update.status, 404);

  const rotate = await fetch(`${base}/devices/${deviceId}/rotate-key`, { method: 'POST', headers });
  assert.equal(rotate.status, 404);

  const remove = await fetch(`${base}/devices/${deviceId}`, { method: 'DELETE', headers });
  assert.equal(remove.status, 404);
});
