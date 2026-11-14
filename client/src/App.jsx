import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useEdgesState, useNodesState, MarkerType
} from "@xyflow/react";
import { Activity, Bell, Database, Plus, Radio, Server, Wifi } from "lucide-react";
import { io } from "socket.io-client";
import { SensorNode, MovingAverageNode, AlertNode } from "./nodes/FlowNodes.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const demoReadings = Array.from({ length: 12 }, (_, index) => ({
  timestamp: new Date(Date.now() - (11 - index) * 60_000).toISOString(),
  temperature: [72.4, 73.1, 74.8, 75.2, 76.5, 77.3, 78.1, 79.4, 80.2, 81.7, 83.1, 86.2][index],
  metadata: { sensorId: "TURBINE-01" }
}));

const initialNodes = [
  { id: "sensor-1", type: "sensor", position: { x: 80, y: 150 }, data: {} },
  { id: "average-1", type: "average", position: { x: 390, y: 150 }, data: {} },
  { id: "alert-1", type: "alert", position: { x: 700, y: 150 }, data: {} }
];
const initialEdges = [
  { id: "e1-2", source: "sensor-1", target: "average-1", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e2-3", source: "average-1", target: "alert-1", animated: true, markerEnd: { type: MarkerType.ArrowClosed } }
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [readings, setReadings] = useState(DEMO_MODE ? demoReadings : []);
  const [connection, setConnection] = useState(DEMO_MODE ? "sample data" : "connecting");
  const [apiStatus, setApiStatus] = useState(DEMO_MODE ? "demo" : "checking");
  const [lastAlert, setLastAlert] = useState(DEMO_MODE ? demoReadings.at(-1) : null);

  const nodeTypes = useMemo(() => ({
    sensor: SensorNode,
    average: MovingAverageNode,
    alert: AlertNode
  }), []);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params, animated: true,
      markerEnd: { type: MarkerType.ArrowClosed }
    }, eds));
  }, [setEdges]);

  useEffect(() => {
    if (DEMO_MODE) return undefined;

    fetch(`${API_URL}/api/health`)
      .then((r) => { if (!r.ok) throw new Error("API unavailable"); return r.json(); })
      .then(() => setApiStatus("online"))
      .catch(() => setApiStatus("offline"));

    fetch(`${API_URL}/api/telemetry/latest?limit=30`)
      .then((r) => r.json())
      .then((result) => setReadings(result.data || []))
      .catch(() => {});

    const socket = io(API_URL);
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => setConnection("disconnected"));
    socket.on("telemetry:point", (point) => {
      setReadings((current) => [...current.slice(-29), point]);
      if (point.temperature > 80) setLastAlert(point);
    });
    socket.on("telemetry:batch", (batch) => {
      setReadings((current) => [...current, ...batch].slice(-30));
      const hot = batch.find((point) => point.temperature > 80);
      if (hot) setLastAlert(hot);
    });

    return () => socket.disconnect();
  }, []);

  const addNode = (type) => {
    const labels = { sensor: "Sensor", average: "Moving Average", alert: "Alert" };
    const id = `${type}-${Date.now()}`;
    setNodes((current) => [...current, {
      id, type, position: { x: 120 + current.length * 35, y: 330 + (current.length % 3) * 30 },
      data: { label: labels[type] }
    }]);
  };

  const latest = readings.at(-1);
  const average = readings.length
    ? readings.slice(-5).reduce((sum, item) => sum + item.temperature, 0) / Math.min(5, readings.length)
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Activity size={21} /></div>
          <div><strong>NexusFlow</strong><span>INDUSTRIAL TELEMETRY PLATFORM</span></div>
        </div>
        <div className="topbar-right">
          <span className={`status-pill ${apiStatus}`}><Server size={14} /> {DEMO_MODE ? "Demo mode" : `API ${apiStatus}`}</span>
          <span className={`status-pill ${DEMO_MODE || connection === "connected" ? "online" : "offline"}`}><Wifi size={14} /> {connection}</span>
        </div>
      </header>

      <section className="page-heading">
        <div><p className="eyebrow">WORKSPACE / OVERVIEW</p><h1>Telemetry Rule Builder</h1>
          <p className="muted">Design and monitor your industrial data pipelines.</p></div>
        <div className="workspace-tag"><Radio size={15} /> Factory floor · Turbine 01</div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><span>Latest temperature</span><strong>{latest ? `${latest.temperature.toFixed(1)}°C` : "--"}</strong><small>Most recent reading</small></article>
        <article className="stat-card"><span>5-reading average</span><strong>{average !== null ? `${average.toFixed(1)}°C` : "--"}</strong><small>Basic moving average preview</small></article>
        <article className="stat-card"><span>Readings in view</span><strong>{readings.length}</strong><small>Recent telemetry points</small></article>
        <article className="stat-card"><span>Rule status</span><strong className={lastAlert ? "warning-text" : "healthy-text"}>{lastAlert ? "Alert" : "Healthy"}</strong><small>{lastAlert ? "Temperature crossed 80°C" : "No threshold alert received"}</small></article>
      </section>

      <section className="workspace">
        <div className="section-toolbar">
          <div><h2>Pipeline canvas</h2><p className="muted">Drag nodes, connect handles, and arrange your flow.</p></div>
          <div className="toolbar-actions">
            <button onClick={() => addNode("sensor")}><Plus size={15}/> Sensor</button>
            <button onClick={() => addNode("average")}><Plus size={15}/> Filter</button>
            <button onClick={() => addNode("alert")}><Plus size={15}/> Action</button>
          </div>
        </div>
        <div className="flow-canvas">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} fitView fitViewOptions={{ padding: 0.2 }}>
            <Background color="#263449" gap={22} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
        </div>
        <div className="canvas-footer"><span><span className="legend-dot" /> {nodes.length} nodes</span><span>{edges.length} connections</span><span>Draft graph · not compiled yet</span></div>
      </section>

      <section className="bottom-grid">
        <article className="panel">
          <div className="panel-title"><Database size={17}/><h3>Recent telemetry</h3></div>
          {readings.length === 0 ? <p className="empty-state">No readings yet. Send a test reading to see live data here.</p> :
            <div className="reading-list">{[...readings].slice(-6).reverse().map((item, i) =>
              <div className="reading-row" key={`${item.timestamp}-${i}`}>
                <span>{item.metadata?.sensorId || "sensor"}</span>
                <strong className={item.temperature > 80 ? "warning-text" : ""}>{item.temperature.toFixed(1)}°C</strong>
                <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
              </div>)}</div>}
        </article>
        <article className="panel alert-panel">
          <div className="panel-title"><Bell size={17}/><h3>Alert monitor</h3></div>
          {lastAlert ? <div className="alert-message"><strong>High temperature detected</strong>
            <p>{lastAlert.metadata?.sensorId} reported {lastAlert.temperature}°C.</p>
            <small>{new Date(lastAlert.timestamp).toLocaleString()}</small></div> :
            <p className="empty-state">No threshold alerts received. Alerts appear when a reading is above 80°C.</p>}
        </article>
      </section>
      <footer>{DEMO_MODE ? "DEMO MODE · SAMPLE DATA · NO BACKEND REQUIRED" : "NEXUSFLOW · WEEK 1 FOUNDATION BUILD"}</footer>
    </main>
  );
}
