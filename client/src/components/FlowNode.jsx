import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NODE_DEFS } from '../nodeDefs';
import { useLive } from '../LiveContext';

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)) : String(v));

function FlowNode({ id, type, data, selected }) {
  const def = NODE_DEFS[type];
  const live = useLive();
  if (!def) return <div className="fnode">Unknown node</div>;
  const Icon = def.icon;
  const active = live?.glow.has(id);
  const value = live?.nodeValues[id];
  return (
    <div className={`fnode ${selected ? 'selected' : ''} ${active ? 'fire' : ''}`} style={{ '--c': def.color }}>
      {def.inputs && <Handle type="target" position={Position.Left} />}
      <div className="fnode-head">
        <span className="fnode-icon"><Icon size={14} /></span>
        <span className="fnode-title">{data.label || def.label}</span>
      </div>
      <div className="fnode-body">{def.summary(data)}</div>
      {value !== undefined && <div className="fnode-live"><i /> {fmt(value)}</div>}
      {def.outputs && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
export default memo(FlowNode);
