import { Handle, Position } from "@xyflow/react";

function NodeShell({ title, subtitle, color, children }) {
  return (
    <div className="flow-node" style={{ "--node-color": color }}>
      <Handle type="target" position={Position.Left} />
      <div className="node-heading"><span className="node-dot" />{title}</div>
      <div className="node-subtitle">{subtitle}</div>
      {children}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function SensorNode() {
  return <NodeShell title="Turbine Sensor" subtitle="Source · temperature (°C)" color="#38bdf8">
    <div className="node-value">Live telemetry input</div>
  </NodeShell>;
}

export function MovingAverageNode() {
  return <NodeShell title="Moving Average" subtitle="Transform · smoothing" color="#a78bfa">
    <div className="node-value">Window: 5 readings</div>
  </NodeShell>;
}

export function AlertNode() {
  return <NodeShell title="SMS Alert" subtitle="Action · notification" color="#fb923c">
    <div className="node-value">When value exceeds 80°C</div>
  </NodeShell>;
}
