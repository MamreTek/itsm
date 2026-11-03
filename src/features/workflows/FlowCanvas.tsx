import { useEffect, useId, useRef } from 'react';
import { AuditOutlined, BranchesOutlined, CheckCircleOutlined, PlayCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { typeText } from '../../shared/api/contracts';
import { nodeText, portText } from '../../shared/api/workflows';
import type { FlowGraph, FlowNode, WorkflowRun } from '../../shared/api/workflows';

const icons = { start: PlayCircleOutlined, condition: BranchesOutlined, approval: AuditOutlined, task: ToolOutlined, end: CheckCircleOutlined };
export function FlowCanvas({ graph, selectedId, onSelect, onMove, run }: {
  graph: FlowGraph;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  run?: WorkflowRun;
}) {
  const arrowId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const viewport = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  useEffect(() => {
    const node = graphRef.current.nodes.find(item => item.id === selectedId);
    const element = viewport.current;
    if (node && element) {
      // Pan inside the canvas on selection, without scrolling the whole page or following every drag event.
      element.scrollLeft = Math.max(0, node.x - (element.clientWidth - 190) / 2);
      element.scrollTop = Math.max(0, node.y - (element.clientHeight - 64) / 2);
    }
  }, [selectedId]);
  const drag = useRef<{ id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const move = (node: FlowNode, x: number, y: number) => onMove?.(node.id, Math.max(0, Math.min(900, x)), Math.max(0, Math.min(700, y)));
  return <div ref={viewport} className="flow-viewport" tabIndex={0} aria-label="流程画布，可在区域内滚动">
    <div className="flow-board" role="group" aria-label={run ? '冻结版本流程图' : '流程图'}>
      <svg className="flow-lines" width="1100" height="800" role="img" aria-label="流程连线与方向">
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {graph.edges.map(edge => {
          const source = graph.nodes.find(node => node.id === edge.source);
          const target = graph.nodes.find(node => node.id === edge.target);
          if (!source || !target) return null;
          const x1 = source.x + 95, y1 = source.y + 64, x2 = target.x + 95, y2 = target.y;
          const middle = (y1 + y2) / 2;
          const traversed = run?.visitedEdgeIds.includes(edge.id);
          return <g key={edge.id} className={traversed ? 'flow-edge traversed' : 'flow-edge'}>
            <path d={`M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`} markerEnd={`url(#${arrowId})`} />
            <text x={(x1 + x2) / 2 + 10} y={middle - 8} textAnchor="middle">{portText[edge.port]}</text>
          </g>;
        })}
      </svg>
      {graph.nodes.map(node => {
        const Icon = icons[node.kind];
        const current = run?.currentNodeId === node.id;
        const visited = run?.trace.some(event => event.nodeId === node.id);
        const conditionLabel = node.condition && `${node.condition.field === 'priority' ? '优先级' : '类型'}=${node.condition.field === 'type' ? typeText[node.condition.value as keyof typeof typeText] ?? node.condition.value : node.condition.value}`;
        return <button key={node.id} type="button" style={{ left: node.x, top: node.y }}
          className={`flow-node kind-${node.kind}${selectedId === node.id ? ' selected' : ''}${current ? ' current' : visited ? ' visited' : ''}${onMove ? ' movable' : ''}`}
          aria-label={`${nodeText[node.kind]}节点：${node.label || '未命名'}`}
          aria-pressed={selectedId === node.id}
          onClick={() => onSelect?.(node.id)}
          onPointerDown={event => {
            if (!onMove || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: node.id, x: node.x, y: node.y, clientX: event.clientX, clientY: event.clientY };
          }}
          onPointerMove={event => {
            const start = drag.current;
            if (start?.id === node.id && (event.clientX !== start.clientX || event.clientY !== start.clientY))
              move(node, start.x + event.clientX - start.clientX, start.y + event.clientY - start.clientY);
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={event => {
            const deltas: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
            if (onMove && deltas[event.key]) {
              event.preventDefault();
              const [dx, dy] = deltas[event.key];
              move(node, node.x + dx, node.y + dy);
            }
          }}>
          <Icon aria-hidden /><span><span className="flow-node-kind">{conditionLabel || nodeText[node.kind]}{current ? ' · 等待中' : ''}</span><strong>{node.label || '未命名'}</strong></span>
        </button>;
      })}
    </div>
  </div>;
}
