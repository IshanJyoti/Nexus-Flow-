const test = require('node:test');
const assert = require('node:assert');
const { Subject } = require('rxjs');
const { compile, validate } = require('../src/compiler');

const node = (id, type, data = {}) => ({ id, type, data: { label: type, ...data }, position: { x: 0, y: 0 } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const pt = (value, metric = 'temperature', deviceId = 't1') => ({ deviceId, metric, value, ts: Date.now() });

test('sensor -> moving average -> threshold -> SMS fires only on sustained anomaly', () => {
  const telemetry$ = new Subject();
  const fired = [];
  const graph = {
    nodes: [node('a', 'source', { deviceId: 't1', metric: 'temperature' }), node('b', 'movingAvg', { window: 3 }),
      node('c', 'threshold', { operator: '>', value: 80 }), node('d', 'sms', { phone: '+910000000000' })],
    edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')],
  };
  const sub = compile(graph, { telemetry$, onAction: (n, ev) => fired.push(ev.value) });
  [70, 75, 80].forEach((v) => telemetry$.next(pt(v)));
  assert.equal(fired.length, 0);
  telemetry$.next(pt(300)); // spike: avg(75,80,300) > 80
  assert.equal(fired.length, 1);
  telemetry$.next(pt(5, 'rpm')); // other metric ignored
  assert.equal(fired.length, 1);
  sub.unsubscribe();
  telemetry$.next(pt(500));
  assert.equal(fired.length, 1, 'no events after undeploy');
});

test('math node transforms values', () => {
  const telemetry$ = new Subject();
  const out = [];
  const graph = {
    nodes: [node('a', 'source', { deviceId: 't1' }), node('m', 'math', { op: 'mul', operand: 2 }), node('w', 'webhook', { url: 'http://x.test' })],
    edges: [edge('a', 'm'), edge('m', 'w')],
  };
  compile(graph, { telemetry$, onAction: (n, ev) => out.push(ev.value) });
  telemetry$.next(pt(21, 'any'));
  assert.deepEqual(out, [42]);
});

test('AND gate requires both conditions within the time window', () => {
  const telemetry$ = new Subject();
  const out = [];
  const graph = {
    nodes: [node('t', 'source', { deviceId: 't1', metric: 'temperature' }), node('v', 'source', { deviceId: 't1', metric: 'vibration' }),
      node('tt', 'threshold', { operator: '>', value: 80 }), node('vt', 'threshold', { operator: '>', value: 4 }),
      node('g', 'logic', { mode: 'AND', windowMs: 5000 }), node('s', 'sms', { phone: '1' })],
    edges: [edge('t', 'tt'), edge('v', 'vt'), edge('tt', 'g'), edge('vt', 'g'), edge('g', 's')],
  };
  compile(graph, { telemetry$, onAction: () => out.push(1) });
  telemetry$.next(pt(90, 'temperature'));
  assert.equal(out.length, 0);
  telemetry$.next(pt(5, 'vibration'));
  assert.equal(out.length, 1);
});

test('validation catches cycles, orphans and bad config', () => {
  const cyc = validate({ nodes: [node('a', 'source', { deviceId: 'x' }), node('b', 'math', { operand: 1 }), node('c', 'math', { operand: 1 })],
    edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'b')] });
  assert.ok(cyc.errors.some((e) => /loop/i.test(e)));
  const bad = validate({ nodes: [node('s', 'sms', {})], edges: [] });
  assert.ok(bad.errors.length >= 2);
  assert.ok(validate({ nodes: [], edges: [] }).errors.length === 1);
});
