/**
 * Stream compiler: React Flow JSON graph  ->  RxJS Observables.
 * Each node becomes an operator pipeline; edges become subscriptions.
 * Events flowing through are { deviceId, metric, value, ts, ... }.
 */
const { merge, combineLatest, Subscription } = require('rxjs');
const { filter, map, scan, tap, share, throttleTime } = require('rxjs');

const ACTIONS = new Set(['sms', 'webhook']);
const NODE_TYPES = new Set(['source', 'movingAvg', 'math', 'threshold', 'logic', 'cooldown', 'sms', 'webhook']);
const OPERATORS = ['>', '>=', '<', '<=', '==', '!='];

function validate(graph) {
  const errors = [];
  const warnings = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (!nodes.length) return { errors: ['The canvas is empty. Drag a Sensor node onto it to start.'], warnings };

  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) { errors.push('A wire points to a node that no longer exists.'); continue; }
    incoming.get(e.target).push(e.source);
    outgoing.get(e.source).push(e.target);
  }

  for (const n of nodes) {
    if (!NODE_TYPES.has(n.type)) { errors.push(`Unknown node type "${n.type}".`); continue; }
    const d = n.data || {};
    const label = d.label || n.type;
    if (n.type === 'source' && !d.deviceId) errors.push(`${label}: choose a device ID.`);
    if (n.type !== 'source' && !incoming.get(n.id).length) errors.push(`${label} has no input wire.`);
    if (!ACTIONS.has(n.type) && !outgoing.get(n.id).length) warnings.push(`${label} output is not connected to anything.`);
    if (n.type === 'movingAvg' && !(+d.window >= 1)) errors.push(`${label}: window must be 1 or more.`);
    if (n.type === 'math' && !Number.isFinite(+d.operand)) errors.push(`${label}: operand must be a number.`);
    if (n.type === 'threshold') {
      if (!OPERATORS.includes(d.operator || '>')) errors.push(`${label}: invalid operator.`);
      if (d.value === '' || d.value == null || !Number.isFinite(+d.value)) errors.push(`${label}: threshold value must be a number.`);
    }
    if (n.type === 'sms' && !String(d.phone || '').trim()) errors.push(`${label}: enter a phone number.`);
    if (n.type === 'webhook' && !/^https?:\/\//i.test(d.url || '')) errors.push(`${label}: enter a valid http(s) URL.`);
    if (n.type === 'logic' && (d.mode || 'AND') === 'AND' && incoming.get(n.id).length < 2) warnings.push(`${label}: an AND gate needs 2+ inputs to be useful.`);
  }
  if (!nodes.some((n) => n.type === 'source')) errors.push('Add at least one Sensor (data source).');
  if (!nodes.some((n) => ACTIONS.has(n.type))) warnings.push('No action node: the rule will run but never notify anyone.');

  const state = new Map(); // 1 = visiting, 2 = done
  let cyclic = false;
  const dfs = (id) => {
    state.set(id, 1);
    for (const t of outgoing.get(id)) {
      if (state.get(t) === 1) cyclic = true;
      else if (!state.get(t)) dfs(t);
    }
    state.set(id, 2);
  };
  nodes.forEach((n) => { if (!state.get(n.id) && outgoing.has(n.id)) dfs(n.id); });
  if (cyclic) errors.push('The graph contains a loop. Rules must flow in one direction.');
  return { errors, warnings: [...new Set(warnings)] };
}

const COMPARE = {
  '>': (a, t) => a > t, '>=': (a, t) => a >= t, '<': (a, t) => a < t,
  '<=': (a, t) => a <= t, '==': (a, t) => a === t, '!=': (a, t) => a !== t,
};
const MATH = {
  add: (v, k) => v + k, sub: (v, k) => v - k, mul: (v, k) => v * k,
  div: (v, k) => (k === 0 ? v : v / k), pow: (v, k) => Math.pow(v, k),
};

/**
 * @param graph  { nodes, edges }
 * @param ctx    { telemetry$, onFire(nodeId, ev), onAction(node, ev) }
 * @returns Subscription (call .unsubscribe() to undeploy)
 */
function compile(graph, { telemetry$, onFire = () => {}, onAction = () => {} }) {
  const { errors } = validate(graph);
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { validation: errors });

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const inputs = new Map(graph.nodes.map((n) => [n.id, []]));
  const hasOutput = new Set();
  graph.edges.forEach((e) => { inputs.get(e.target).push(e.source); hasOutput.add(e.source); });

  const cache = new Map();
  const build = (id) => {
    if (cache.has(id)) return cache.get(id);
    const node = byId.get(id);
    const d = node.data || {};
    const ups = inputs.get(id).map(build);
    const merged = () => (ups.length === 1 ? ups[0] : merge(...ups));
    let stream;

    switch (node.type) {
      case 'source':
        stream = telemetry$.pipe(
          filter((p) => p.deviceId === d.deviceId && (!d.metric || d.metric === '*' || p.metric === d.metric)),
        );
        break;
      case 'movingAvg': {
        const size = Math.max(1, Math.floor(+d.window || 5));
        stream = merged().pipe(
          scan((acc, ev) => {
            const buf = acc.buf.concat(ev.value);
            if (buf.length > size) buf.shift();
            return { buf, ev };
          }, { buf: [], ev: null }),
          map(({ buf, ev }) => ({ ...ev, raw: ev.value, value: buf.reduce((a, b) => a + b, 0) / buf.length })),
        );
        break;
      }
      case 'math': {
        const k = +d.operand;
        const fn = MATH[d.op || 'add'] || MATH.add;
        stream = merged().pipe(map((ev) => ({ ...ev, value: fn(ev.value, k) })));
        break;
      }
      case 'threshold': {
        const t = +d.value;
        const cmp = COMPARE[d.operator || '>'];
        stream = merged().pipe(filter((ev) => cmp(ev.value, t)));
        break;
      }
      case 'logic': {
        const win = Math.max(0, +d.windowMs || 5000);
        if ((d.mode || 'AND') === 'OR' || ups.length < 2) stream = merged();
        else {
          stream = combineLatest(ups).pipe(
            filter((evs) => { const ts = evs.map((e) => e.ts); return Math.max(...ts) - Math.min(...ts) <= win; }),
            map((evs) => ({ ...evs.reduce((a, b) => (b.ts > a.ts ? b : a)), inputs: evs.map((e) => e.value) })),
          );
        }
        break;
      }
      case 'cooldown':
        stream = merged().pipe(throttleTime(Math.max(0, +d.ms || 10000)));
        break;
      default: // sms | webhook
        stream = merged();
    }
    stream = stream.pipe(tap((ev) => onFire(id, ev)), share());
    cache.set(id, stream);
    return stream;
  };

  const root = new Subscription();
  for (const n of graph.nodes) {
    if (hasOutput.has(n.id) && !ACTIONS.has(n.type)) continue;
    root.add(build(n.id).subscribe({
      next: (ev) => { if (ACTIONS.has(n.type)) { try { onAction(n, ev); } catch (e) { console.error('[action]', e.message); } } },
      error: (e) => console.error(`[compiler] node ${n.id} failed:`, e.message),
    }));
  }
  return root;
}

module.exports = { compile, validate, NODE_TYPES };
