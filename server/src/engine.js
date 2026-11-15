const { Subject } = require('rxjs');
const { EventEmitter } = require('events');
const { compile } = require('./compiler');
const actions = require('./actions');

/** Holds every deployed rule graph and pushes telemetry through their pipelines. */
class Engine extends EventEmitter {
  constructor() {
    super();
    this.telemetry$ = new Subject();
    this.deployed = new Map();
  }

  deploy(graph) {
    const id = String(graph._id || graph.id);
    const name = graph.name || 'Untitled rule';
    const sub = compile(graph, {
      telemetry$: this.telemetry$,
      onFire: (nodeId, ev) => this.emit('fire', { graphId: id, nodeId, value: ev.value, ts: ev.ts }),
      onAction: (node, ev) => {
        actions.run({ graph: { id, name }, node, ev })
          .then((alert) => alert && this.emit('alert', alert))
          .catch((e) => console.error('[action]', e.message));
      },
    });
    this.undeploy(id);
    this.deployed.set(id, { sub, name, since: Date.now() });
  }

  undeploy(id) {
    const cur = this.deployed.get(String(id));
    if (cur) { cur.sub.unsubscribe(); this.deployed.delete(String(id)); }
  }

  isDeployed(id) { return this.deployed.has(String(id)); }

  ingest(points) {
    for (const p of points) this.telemetry$.next(p);
  }
}

module.exports = new Engine();
