import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, MarkerType } from 'reactflow';
import {
  Save, Play, Square, ShieldCheck, FilePlus, Sparkles, Upload, Download, Trash2, Copy,
  AlertCircle, CheckCircle2, AlertTriangle, MousePointerClick, Braces, SlidersHorizontal,
} from 'lucide-react';
import { api } from '../api';
import { useLive } from '../LiveContext';
import { useToast } from '../Toast';
import FlowNode from '../components/FlowNode';
import { CATEGORIES, NODE_DEFS, makeNode, buildTemplate } from '../nodeDefs';

const nodeTypes = Object.fromEntries(Object.keys(NODE_DEFS).map((t) => [t, FlowNode]));
const decorate = (e) => ({ ...e, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' } });
const graphData = (name, nodes = [], edges = []) => ({
  name,
  nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position: { x: Math.round(position.x), y: Math.round(position.y) }, data })),
  edges: edges.map(({ id, source, target }) => ({ id, source, target })),
});
const reaches = (edges, from, to) => {
  const seen = new Set(); const stack = [from];
  while (stack.length) {
    const n = stack.pop();
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    edges.forEach((e) => { if (e.source === n) stack.push(e.target); });
  }
  return false;
};

export default function Builder({ userId }) {
  const toast = useToast();
  const { glow, devices, resetNodeValues } = useLive();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [meta, setMeta] = useState({ id: null, name: 'Untitled rule', active: false });
  const [graphs, setGraphs] = useState([]);
  const [rf, setRf] = useState(null);
  const [panel, setPanel] = useState('inspect');
  const [issues, setIssues] = useState(null);
  const [saved, setSaved] = useState('');
  const [loadedForUser, setLoadedForUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const serialize = useCallback(() => graphData(meta.name, nodes, edges), [nodes, edges, meta.name]);

  const snapshot = useMemo(() => JSON.stringify(serialize()), [serialize]);
  const dirty = snapshot !== saved;
  const selected = nodes.filter((n) => n.selected);
  const selNode = selected.length === 1 ? selected[0] : null;

  const refreshList = useCallback(() => api.graphs().then(setGraphs).catch(() => {}), []);
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const draftKey = `nf_builder_draft:${userId}`;
    let draft = null;

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const valid = parsed?.version === 1
          && (parsed.id == null || typeof parsed.id === 'string')
          && typeof parsed.name === 'string'
          && Array.isArray(parsed.nodes)
          && parsed.nodes.every((n) => n && typeof n.id === 'string' && typeof n.type === 'string'
            && n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
            && n.data && typeof n.data === 'object')
          && Array.isArray(parsed.edges)
          && parsed.edges.every((e) => e && typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string')
          && typeof parsed.saved === 'string';
        if (valid) draft = parsed;
        else {
          localStorage.removeItem(draftKey);
          toast('The saved builder draft was invalid and could not be restored.', 'error');
        }
      }
    } catch (e) {
      toast(`Could not read the saved builder draft: ${e.message}`, 'error');
    }

    const restore = (graph, baseline, active) => {
      const restoredNodes = (graph.nodes || []).map((n) => ({ ...n, selected: false }));
      const restoredEdges = (graph.edges || []).map(decorate);
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setMeta({ id: graph.id || null, name: graph.name || 'Untitled rule', active: !!active });
      setSaved(baseline);
      resetNodeValues();
    };

    api.graphs().then((list) => {
      if (cancelled) return;
      setGraphs(list);
      if (draft) {
        const serverGraph = list.find((g) => g.id === draft.id);
        restore({ ...draft, id: serverGraph ? draft.id : null }, draft.saved, serverGraph?.active);
      } else if (list.length) {
        const graph = list[0];
        restore(graph, JSON.stringify(graphData(graph.name || 'Untitled rule', graph.nodes || [], graph.edges || [])), graph.active);
      } else {
        restore({ name: 'Untitled rule', nodes: [], edges: [] }, JSON.stringify(graphData('Untitled rule')), false);
      }
      setLoadedForUser(userId);
    }).catch((e) => {
      if (cancelled) return;
      toast(`Could not load saved rules: ${e.message}`, 'error');
      if (draft) restore(draft, draft.saved, false);
      else restore({ name: 'Untitled rule', nodes: [], edges: [] }, JSON.stringify(graphData('Untitled rule')), false);
      setLoadedForUser(userId);
    });

    return () => { cancelled = true; };
  }, [userId, resetNodeValues, setNodes, setEdges, toast]);

  useEffect(() => {
    if (!userId || loadedForUser !== userId) return;
    const body = serialize();
    try {
      localStorage.setItem(`nf_builder_draft:${userId}`, JSON.stringify({
        version: 1,
        id: meta.id,
        name: meta.name,
        nodes: body.nodes,
        edges: body.edges,
        saved,
      }));
    } catch (e) {
      toast(`Could not autosave the builder draft: ${e.message}`, 'error');
    }
  }, [userId, loadedForUser, serialize, meta.id, meta.name, saved, toast]);

  const applyGraph = useCallback((g, markSaved = true) => {
    const ns = (g.nodes || []).map((n) => ({ ...n, selected: false }));
    const es = (g.edges || []).map(decorate);
    setNodes(ns); setEdges(es);
    setMeta({ id: g.id || null, name: g.name || 'Untitled rule', active: !!g.active });
    setIssues(null); resetNodeValues();
    if (markSaved) setSaved(JSON.stringify(graphData(g.name || 'Untitled rule', ns, es)));
    setTimeout(() => rf && rf.fitView({ padding: 0.2, duration: 400 }), 60);
  }, [rf, setNodes, setEdges, resetNodeValues]);

  /* ---------- canvas interactions ---------- */
  const onConnect = useCallback((c) => setEdges((eds) => addEdge(decorate({ ...c }), eds)), [setEdges]);
  const isValidConnection = useCallback((c) => c.source !== c.target && !reaches(edges, c.target, c.source), [edges]);

  const onDrop = useCallback((ev) => {
    ev.preventDefault();
    const type = ev.dataTransfer.getData('application/nexusflow');
    if (!type || !NODE_DEFS[type] || !rf) return;
    const position = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
    setNodes((ns) => ns.concat({ ...makeNode(type, position), selected: true }).map((n, i, a) => (i < a.length - 1 ? { ...n, selected: false } : n)));
    setPanel('inspect');
  }, [rf, setNodes]);

  const addByClick = (type) => {
    if (!rf) return;
    const vp = rf.getViewport();
    const position = { x: (-vp.x + 260) / vp.zoom + Math.random() * 60, y: (-vp.y + 160) / vp.zoom + Math.random() * 80 };
    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })).concat({ ...makeNode(type, position), selected: true }));
    setPanel('inspect');
  };

  const updateData = (id, key, value) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n)));
  const removeNode = (id) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); };

  /* ---------- persistence & deployment ---------- */
  const save = async () => {
    const body = serialize();
    const g = meta.id ? await api.updateGraph(meta.id, body) : await api.createGraph(body);
    setMeta({ id: g.id, name: g.name, active: g.active });
    setSaved(JSON.stringify(body));
    refreshList();
    if (g.warning) toast(g.warning, 'error');
    return g;
  };

  const run = (fn) => async (...a) => {
    setBusy(true);
    try { await fn(...a); } catch (e) {
      if (e.errors) { setIssues({ errors: e.errors, warnings: [] }); setPanel('checks'); toast(e.message, 'error'); } else toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const onSave = run(async () => { await save(); toast('Rule saved', 'success'); });
  const onValidate = run(async () => { setIssues(await api.validate(serialize())); setPanel('checks'); });
  const onDeploy = run(async () => {
    const g = await save();
    const res = await api.deploy(g.id);
    setMeta((m) => ({ ...m, active: true }));
    setIssues({ errors: [], warnings: res.warnings || [] });
    refreshList();
    toast('Rule deployed. Telemetry is now flowing through it.', 'success');
  });
  const onStop = run(async () => { await api.undeploy(meta.id); setMeta((m) => ({ ...m, active: false })); resetNodeValues(); refreshList(); toast('Rule stopped', 'info'); });
  const onDelete = run(async () => {
    if (!meta.id || !window.confirm(`Delete "${meta.name}"? This can't be undone.`)) return;
    await api.deleteGraph(meta.id);
    applyGraph({ name: 'Untitled rule', nodes: [], edges: [] }); refreshList(); toast('Rule deleted', 'info');
  });

  const onNew = () => {
    if (dirty && nodes.length && !window.confirm('Discard unsaved changes?')) return;
    applyGraph({ name: 'Untitled rule', nodes: [], edges: [] });
  };
  const onTemplate = () => {
    if (dirty && nodes.length && !window.confirm('Replace the canvas with the example rule?')) return;
    applyGraph(buildTemplate(), false);
  };
  const onPick = (e) => {
    const g = graphs.find((x) => x.id === e.target.value);
    if (!g) return;
    if (dirty && nodes.length && !window.confirm('Discard unsaved changes?')) return;
    applyGraph(g);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${meta.name.replace(/\W+/g, '-').toLowerCase() || 'rule'}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) throw new Error('Missing nodes/edges arrays');
      applyGraph({ name: j.name || 'Imported rule', nodes: j.nodes, edges: j.edges }, false);
      toast('Graph imported. Review it, then save.', 'success');
    } catch (err) { toast(`Import failed: ${err.message}`, 'error'); }
  };

  /* wires glow while data passes through the node they leave */
  const shownEdges = useMemo(() => edges.map((e) => (glow.has(e.source) ? { ...e, className: 'glow', animated: true } : e)), [edges, glow]);

  if (!userId || loadedForUser !== userId) return <div className="splash">Restoring your rule…</div>;

  return (
    <div className="builder">
      <aside className="palette">
        <h3>Node Library</h3>
        <p className="muted small">Drag onto the canvas, or click to add.</p>
        {CATEGORIES.map((c) => (
          <section key={c.id}>
            <h4>{c.label}</h4>
            {Object.entries(NODE_DEFS).filter(([, d]) => d.cat === c.id).map(([type, d]) => {
              const Icon = d.icon;
              return (
                <div key={type} className="pal-item" style={{ '--c': d.color }} draggable
                  onDragStart={(e) => { e.dataTransfer.setData('application/nexusflow', type); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => addByClick(type)}>
                  <span className="pal-icon"><Icon size={16} /></span>
                  <span><b>{d.label}</b><small>{d.desc}</small></span>
                </div>
              );
            })}
          </section>
        ))}
      </aside>

      <section className="canvas-col">
        <div className="toolbar">
          <input className="name-input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} aria-label="Rule name" />
          {meta.active && <span className="pill ok"><i className="dot" /> Running</span>}
          {dirty && nodes.length > 0 && <span className="pill warn-pill">Unsaved</span>}
          <select className="select" value={meta.id || ''} onChange={onPick}>
            <option value="" disabled>{graphs.length ? 'Open saved rule…' : 'No saved rules'}</option>
            {graphs.map((g) => <option key={g.id} value={g.id}>{g.active ? '● ' : ''}{g.name}</option>)}
          </select>
          <span className="spacer" />
          <button className="btn ghost" onClick={onNew}><FilePlus size={15} /> New</button>
          <button className="btn ghost" onClick={onTemplate}><Sparkles size={15} /> Example</button>
          <button className="btn ghost" onClick={() => fileRef.current.click()}><Upload size={15} /> Import</button>
          <button className="btn ghost" onClick={exportJson} disabled={!nodes.length}><Download size={15} /> Export</button>
          <button className="btn ghost" onClick={onValidate} disabled={busy || !nodes.length}><ShieldCheck size={15} /> Check</button>
          <button className="btn" onClick={onSave} disabled={busy || !nodes.length}><Save size={15} /> Save</button>
          {meta.active
            ? <button className="btn danger" onClick={onStop} disabled={busy}><Square size={14} /> Stop</button>
            : <button className="btn primary" onClick={onDeploy} disabled={busy || !nodes.length}><Play size={14} /> Deploy</button>}
          {meta.id && <button className="icon-btn" title="Delete rule" onClick={onDelete}><Trash2 size={16} /></button>}
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
        </div>
        {meta.active && dirty && <div className="banner">This rule is live. Press <b>Save</b> to hot-reload your changes into the running stream.</div>}

        <div className="canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes} edges={shownEdges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            isValidConnection={isValidConnection} onInit={setRf}
            deleteKeyCode={['Backspace', 'Delete']} fitView minZoom={0.2} maxZoom={1.8}
            defaultEdgeOptions={{ type: 'smoothstep' }} proOptions={{ hideAttribution: true }}>
            <Background gap={22} size={1.2} color="#26324f" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => NODE_DEFS[n.type]?.color || '#64748b'} maskColor="rgba(8,12,24,.7)" />
          </ReactFlow>
          {!nodes.length && (
            <div className="empty">
              <MousePointerClick size={30} />
              <h3>Design your first rule</h3>
              <p>Drag a <b>Sensor</b> onto the canvas, add a filter, then finish with an alert.</p>
              <button className="btn primary" onClick={onTemplate}><Sparkles size={15} /> Load the turbine example</button>
            </div>
          )}
        </div>
      </section>

      <aside className="side">
        <div className="seg">
          <button className={panel === 'inspect' ? 'on' : ''} onClick={() => setPanel('inspect')}><SlidersHorizontal size={14} /> Inspector</button>
          <button className={panel === 'checks' ? 'on' : ''} onClick={() => setPanel('checks')}><ShieldCheck size={14} /> Checks</button>
          <button className={panel === 'json' ? 'on' : ''} onClick={() => setPanel('json')}><Braces size={14} /> JSON</button>
        </div>
        {panel === 'inspect' && <Inspector node={selNode} count={selected.length} devices={devices} onChange={updateData} onRemove={removeNode} />}
        {panel === 'checks' && <Checks issues={issues} onRun={onValidate} disabled={!nodes.length} />}
        {panel === 'json' && <JsonView data={serialize()} toast={toast} />}
      </aside>
    </div>
  );
}

/* ---------- side panels ---------- */
function Inspector({ node, count, devices, onChange, onRemove }) {
  const { nodeValues } = useLive();
  if (!node) {
    return (
      <div className="panel-empty">
        <MousePointerClick size={22} />
        <p>{count > 1 ? `${count} nodes selected.` : 'Select a node to edit its settings.'}</p>
        <small>Connect nodes by dragging from one dot to another. Press Delete to remove a selection.</small>
      </div>
    );
  }
  const def = NODE_DEFS[node.type];
  const d = node.data;
  const Icon = def.icon;
  const metrics = Object.keys(devices[d.deviceId]?.metrics || {});
  const val = nodeValues[node.id];
  return (
    <div className="inspector" style={{ '--c': def.color }}>
      <div className="insp-head"><span className="pal-icon"><Icon size={16} /></span><div><b>{def.label}</b><small>{def.desc}</small></div></div>
      <label>Label<input value={d.label || ''} onChange={(e) => onChange(node.id, 'label', e.target.value)} /></label>
      {def.fields.map((f) => (
        <label key={f.key}>{f.label}
          {f.type === 'select' ? (
            <select value={d[f.key] ?? ''} onChange={(e) => onChange(node.id, f.key, e.target.value)}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          ) : f.type === 'textarea' ? (
            <textarea rows={3} value={d[f.key] ?? ''} onChange={(e) => onChange(node.id, f.key, e.target.value)} />
          ) : f.type === 'number' ? (
            <input type="number" min={f.min} step={f.step} value={d[f.key] ?? ''} onChange={(e) => onChange(node.id, f.key, e.target.value === '' ? '' : Number(e.target.value))} />
          ) : (
            <input list={f.type === 'device' ? 'dl-devices' : f.type === 'metric' ? 'dl-metrics' : undefined} value={d[f.key] ?? ''} onChange={(e) => onChange(node.id, f.key, e.target.value)} />
          )}
        </label>
      ))}
      <datalist id="dl-devices">{Object.keys(devices).sort().map((id) => <option key={id} value={id} />)}</datalist>
      <datalist id="dl-metrics"><option value="*" />{metrics.map((m) => <option key={m} value={m} />)}</datalist>
      {val !== undefined && <div className="live-box">Last value through this node <b>{typeof val === 'number' ? val.toFixed(2) : String(val)}</b></div>}
      <button className="btn danger wide" onClick={() => onRemove(node.id)}><Trash2 size={14} /> Remove node</button>
    </div>
  );
}

function Checks({ issues, onRun, disabled }) {
  if (!issues) {
    return (
      <div className="panel-empty">
        <ShieldCheck size={22} />
        <p>Validate before you deploy.</p>
        <small>Catches loops, unconnected nodes and missing settings.</small>
        <button className="btn" onClick={onRun} disabled={disabled}>Run checks</button>
      </div>
    );
  }
  const ok = !issues.errors.length;
  return (
    <div className="checks">
      <div className={`check-head ${ok ? 'ok' : 'bad'}`}>
        {ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        {ok ? 'Ready to deploy' : `${issues.errors.length} problem${issues.errors.length > 1 ? 's' : ''} to fix`}
      </div>
      {issues.errors.map((m, i) => <div key={`e${i}`} className="issue err"><AlertCircle size={14} />{m}</div>)}
      {issues.warnings.map((m, i) => <div key={`w${i}`} className="issue warn"><AlertTriangle size={14} />{m}</div>)}
      <button className="btn ghost" onClick={onRun} disabled={disabled}>Re-run checks</button>
    </div>
  );
}

function JsonView({ data, toast }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <div className="jsonview">
      <div className="json-bar">
        <span className="muted small">{data.nodes.length} nodes · {data.edges.length} wires · exactly what the backend compiles</span>
        <button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast('JSON copied', 'success'))}><Copy size={13} /> Copy</button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
