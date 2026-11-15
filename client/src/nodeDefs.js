import { Cpu, Activity, Calculator, Gauge, GitMerge, Timer, MessageSquare, Webhook } from 'lucide-react';

export const CATEGORIES = [
  { id: 'source', label: 'Data Sources' },
  { id: 'transform', label: 'Filters & Math' },
  { id: 'logic', label: 'Conditions' },
  { id: 'action', label: 'Action Triggers' },
];

const MATH_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷', pow: '^' };
const short = (s = '', n = 26) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One definition drives the palette, the canvas node, and the inspector form. */
export const NODE_DEFS = {
  source: {
    label: 'Sensor', cat: 'source', icon: Cpu, color: '#22d3ee', inputs: false, outputs: true,
    desc: 'Live readings from a device',
    defaults: { deviceId: 'turbine-1', metric: 'temperature' },
    fields: [
      { key: 'deviceId', label: 'Device ID', type: 'device' },
      { key: 'metric', label: 'Metric (* = any)', type: 'metric' },
    ],
    summary: (d) => `${d.deviceId || 'pick a device'} · ${d.metric || '*'}`,
  },
  movingAvg: {
    label: 'Moving Average', cat: 'transform', icon: Activity, color: '#a78bfa', inputs: true, outputs: true,
    desc: 'Smooths noisy readings',
    defaults: { window: 5 },
    fields: [{ key: 'window', label: 'Window (readings)', type: 'number', min: 1 }],
    summary: (d) => `avg of last ${d.window || 5} readings`,
  },
  math: {
    label: 'Math Operation', cat: 'transform', icon: Calculator, color: '#818cf8', inputs: true, outputs: true,
    desc: 'Add, scale, convert units',
    defaults: { op: 'mul', operand: 1 },
    fields: [
      { key: 'op', label: 'Operation', type: 'select', options: [['add', 'Add (+)'], ['sub', 'Subtract (−)'], ['mul', 'Multiply (×)'], ['div', 'Divide (÷)'], ['pow', 'Power (^)']] },
      { key: 'operand', label: 'Operand', type: 'number', step: 'any' },
    ],
    summary: (d) => `value ${MATH_SYMBOL[d.op] || '+'} ${d.operand ?? 0}`,
  },
  threshold: {
    label: 'Threshold', cat: 'logic', icon: Gauge, color: '#fbbf24', inputs: true, outputs: true,
    desc: 'Pass only when a condition is true',
    defaults: { operator: '>', value: 80 },
    fields: [
      { key: 'operator', label: 'Operator', type: 'select', options: [['>', '> greater than'], ['>=', '≥ at least'], ['<', '< less than'], ['<=', '≤ at most'], ['==', '= equals'], ['!=', '≠ not equal']] },
      { key: 'value', label: 'Value', type: 'number', step: 'any' },
    ],
    summary: (d) => `value ${d.operator || '>'} ${d.value ?? '?'}`,
  },
  logic: {
    label: 'Logic Gate', cat: 'logic', icon: GitMerge, color: '#f472b6', inputs: true, outputs: true,
    desc: 'Combine conditions with AND / OR',
    defaults: { mode: 'AND', windowMs: 5000 },
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: [['AND', 'AND (all inputs)'], ['OR', 'OR (any input)']] },
      { key: 'windowMs', label: 'AND time window (ms)', type: 'number', min: 0 },
    ],
    summary: (d) => (d.mode === 'OR' ? 'any input passes' : `all within ${d.windowMs || 5000} ms`),
  },
  cooldown: {
    label: 'Cooldown', cat: 'logic', icon: Timer, color: '#2dd4bf', inputs: true, outputs: true,
    desc: 'Rate-limit noisy signals',
    defaults: { ms: 10000 },
    fields: [{ key: 'ms', label: 'Min gap between events (ms)', type: 'number', min: 0 }],
    summary: (d) => `max 1 per ${((d.ms ?? 10000) / 1000).toFixed(1)}s`,
  },
  sms: {
    label: 'SMS Alert', cat: 'action', icon: MessageSquare, color: '#34d399', inputs: true, outputs: false,
    desc: 'Text the on-call manager',
    defaults: { phone: '+91 98765 43210', message: 'ALERT {{deviceId}}: {{metric}} = {{value}}', cooldownMs: 15000 },
    fields: [
      { key: 'phone', label: 'Phone number', type: 'text' },
      { key: 'message', label: 'Message ({{deviceId}} {{metric}} {{value}})', type: 'textarea' },
      { key: 'cooldownMs', label: 'Alert cooldown (ms)', type: 'number', min: 0 },
    ],
    summary: (d) => d.phone || 'add a phone number',
  },
  webhook: {
    label: 'Webhook', cat: 'action', icon: Webhook, color: '#fb923c', inputs: true, outputs: false,
    desc: 'Call an external API',
    defaults: { url: 'https://httpbin.org/post', method: 'POST', message: '{{metric}} on {{deviceId}} is {{value}}', cooldownMs: 15000 },
    fields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'method', label: 'Method', type: 'select', options: [['POST', 'POST'], ['PUT', 'PUT'], ['GET', 'GET']] },
      { key: 'message', label: 'Message template', type: 'textarea' },
      { key: 'cooldownMs', label: 'Alert cooldown (ms)', type: 'number', min: 0 },
    ],
    summary: (d) => `${d.method || 'POST'} ${short(String(d.url || '').replace(/^https?:\/\//, ''))}`,
  },
};

export const uid = () => `n_${Math.random().toString(36).slice(2, 9)}`;

export const makeNode = (type, position) => ({
  id: uid(), type, position,
  data: { label: NODE_DEFS[type].label, ...NODE_DEFS[type].defaults },
});

/** Starter rule from the project brief: Turbine Sensor -> Moving Average -> SMS Alert. */
export function buildTemplate() {
  const s = { ...makeNode('source', { x: 40, y: 150 }) };
  const a = { ...makeNode('movingAvg', { x: 320, y: 150 }), data: { label: 'Moving Average', window: 5 } };
  const t = { ...makeNode('threshold', { x: 600, y: 150 }), data: { label: 'Threshold', operator: '>', value: 85 } };
  const c = { ...makeNode('cooldown', { x: 880, y: 60 }), data: { label: 'Cooldown', ms: 15000 } };
  const m = makeNode('sms', { x: 1140, y: 60 });
  const w = makeNode('webhook', { x: 880, y: 260 });
  const e = (x, y) => ({ id: `e_${x.id}_${y.id}`, source: x.id, target: y.id });
  return {
    name: 'Turbine overheat alert',
    nodes: [s, a, t, c, m, w],
    edges: [e(s, a), e(a, t), e(t, c), e(c, m), e(t, w)],
  };
}
