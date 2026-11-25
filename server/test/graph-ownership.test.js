const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Graph } = require('../src/models');
const config = require('../src/config');
const api = require('../src/api');

const makeGraph = (id, owner, name) => ({
  _id: id,
  id,
  owner,
  name,
  nodes: [],
  edges: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  markModified() {},
  async save() {},
  toObject() { return { ...this }; },
});

const tokenFor = (id) => jwt.sign({ id }, config.jwtSecret);

test('graph routes only list or mutate graphs belonging to the authenticated user', async (t) => {
  const originalFind = Graph.find;
  const originalFindOne = Graph.findOne;
  const originalFindOneAndDelete = Graph.findOneAndDelete;
  const ownerId = new mongoose.Types.ObjectId().toString();
  const otherOwnerId = new mongoose.Types.ObjectId().toString();
  const ownerGraphId = new mongoose.Types.ObjectId().toString();
  const otherGraphId = new mongoose.Types.ObjectId().toString();
  const graphs = new Map([
    [ownerGraphId, makeGraph(ownerGraphId, ownerId, 'Owner graph')],
    [otherGraphId, makeGraph(otherGraphId, otherOwnerId, 'Other graph')],
  ]);
  const matches = (graph, query) => graph
    && String(graph._id) === String(query._id)
    && (query.owner === undefined || String(graph.owner) === String(query.owner));

  Graph.find = (query) => ({
    sort: async () => [...graphs.values()].filter((graph) => query.owner === undefined || String(graph.owner) === String(query.owner)),
  });
  Graph.findOne = async (query) => [...graphs.values()].find((graph) => matches(graph, query)) || null;
  Graph.findOneAndDelete = async (query) => {
    const graph = [...graphs.values()].find((item) => matches(item, query));
    if (graph) graphs.delete(String(graph._id));
    return graph || null;
  };

  const app = express();
  app.use(express.json());
  app.use('/api', api);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    Graph.find = originalFind;
    Graph.findOne = originalFindOne;
    Graph.findOneAndDelete = originalFindOneAndDelete;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method, userId, body) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(userId)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const listResponse = await request('/graphs', 'GET', ownerId);
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).map((graph) => graph.id), [ownerGraphId]);

  const ownUpdate = await request(`/graphs/${ownerGraphId}`, 'PUT', ownerId, { name: 'Updated graph' });
  assert.equal(ownUpdate.status, 200);
  assert.equal((await ownUpdate.json()).name, 'Updated graph');

  for (const [method, suffix] of [
    ['PUT', ''],
    ['DELETE', ''],
    ['POST', '/deploy'],
    ['POST', '/undeploy'],
  ]) {
    const response = await request(`/graphs/${otherGraphId}${suffix}`, method, ownerId, method === 'PUT' ? { name: 'Changed by another user' } : undefined);
    assert.equal(response.status, 404, `${method} ${suffix || '(graph)'} should not expose another user's graph`);
  }
  assert.equal(graphs.get(otherGraphId).name, 'Other graph');
});
