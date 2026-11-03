import { priorities, ticketTypes } from '../api/contracts';
import type { Person } from '../api/contracts';
import { portsFor } from '../api/workflows';
import type { FlowIssue, FlowValidation, WorkflowDraft } from '../api/workflows';

/** Independent bounded DAG model; no script evaluation or external task execution. */
export function validateWorkflow(draft: WorkflowDraft, people: Person[]): FlowValidation {
  const issues: FlowIssue[] = [];
  const add = (code: string, message: string, nodeId?: string, edgeId?: string) =>
    issues.push({ code, message, nodeId, edgeId });
  const { nodes, edges } = draft.graph;
  if (draft.name.trim().length < 2) add('NAME_REQUIRED', '流程名称至少 2 个字符');
  const starts = nodes.filter(node => node.kind === 'start');
  const ends = nodes.filter(node => node.kind === 'end');
  if (starts.length !== 1) add('START_COUNT', '流程必须且只能有一个开始节点');
  if (!ends.length) add('END_REQUIRED', '流程至少需要一个结束节点');
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) add('DUPLICATE_NODE', '节点 ID 重复', node.id);
    ids.add(node.id);
    if (!node.label.trim()) add('LABEL_REQUIRED', '节点名称不能为空', node.id);
    if (['approval', 'task'].includes(node.kind) && !people.some(person => person.id === node.assigneeId))
      add('ASSIGNEE_REQUIRED', '审批与处理节点必须选择有效的虚构负责人', node.id);
    if (node.kind === 'condition') {
      const condition = node.condition;
      const values: readonly string[] = condition?.field === 'priority' ? priorities : condition?.field === 'type' ? ticketTypes : [];
      if (!condition || !values.includes(condition.value)) add('CONDITION_REQUIRED', '请选择条件字段与合法枚举值', node.id);
    }
    const incoming = edges.filter(edge => edge.target === node.id);
    const outgoing = edges.filter(edge => edge.source === node.id);
    if (node.kind === 'start' && incoming.length) add('START_INCOMING', '开始节点不能有入边', node.id);
    for (const port of portsFor[node.kind]) {
      if (outgoing.filter(edge => edge.port === port).length !== 1)
        add('PORT_COUNT', `节点的 ${port} 出口必须恰好有一条连线`, node.id);
    }
    for (const edge of outgoing) {
      if (!portsFor[node.kind].includes(edge.port)) add('INVALID_PORT', '当前节点不支持此出口', node.id, edge.id);
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) add('DUPLICATE_EDGE', '连线 ID 重复', undefined, edge.id);
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) add('DANGLING_EDGE', '连线指向不存在的节点', undefined, edge.id);
    if (edge.source === edge.target) add('SELF_EDGE', '节点不能连接自身', edge.source, edge.id);
  }
  const reachable = (initial: string[], reverse = false) => {
    const seen = new Set(initial);
    const queue = [...initial];
    for (let index = 0; index < queue.length; index += 1) {
      for (const edge of edges) {
        const source = reverse ? edge.target : edge.source;
        const target = reverse ? edge.source : edge.target;
        if (source === queue[index] && ids.has(target) && !seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
    return seen;
  };
  if (starts.length === 1) {
    const reached = reachable([starts[0].id]);
    const terminating = reachable(ends.map(node => node.id), true);
    for (const node of nodes) {
      if (!reached.has(node.id)) add('UNREACHABLE', '节点无法从开始到达', node.id);
      if (!terminating.has(node.id)) add('NO_END_PATH', '节点没有通向结束的路径', node.id);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = edges.filter(edge => edge.source === id && ids.has(edge.target)).some(edge => visit(edge.target));
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  if (nodes.some(node => visit(node.id))) add('CYCLE', '流程包含环，请使用无环的串行或排他分支');
  return { valid: issues.length === 0, issues };
}

export function exampleDraft(): WorkflowDraft {
  return {
    name: '服务申请分流',
    description: 'P1 请求进入服务台审批，其余请求由基础设施组处理。所有动作均为模拟。',
    graph: {
      nodes: [
        { id: 'start', kind: 'start', label: '提交申请', x: 360, y: 20 },
        { id: 'priority', kind: 'condition', label: '是否为 P1？', x: 360, y: 140, condition: { field: 'priority', value: 'P1' } },
        { id: 'approval', kind: 'approval', label: '服务台审批', x: 100, y: 280, assigneeId: 'person-demo-3' },
        { id: 'standard', kind: 'task', label: '标准请求处理', x: 620, y: 280, assigneeId: 'person-demo-2' },
        { id: 'urgent', kind: 'task', label: '紧急请求处理', x: 100, y: 440, assigneeId: 'person-demo-2' },
        { id: 'end', kind: 'end', label: '流程结束', x: 360, y: 600 },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'priority', port: 'next' },
        { id: 'e2', source: 'priority', target: 'approval', port: 'yes' },
        { id: 'e3', source: 'priority', target: 'standard', port: 'no' },
        { id: 'e4', source: 'approval', target: 'urgent', port: 'approved' },
        { id: 'e5', source: 'approval', target: 'end', port: 'rejected' },
        { id: 'e6', source: 'standard', target: 'end', port: 'next' },
        { id: 'e7', source: 'urgent', target: 'end', port: 'next' },
      ],
    },
  };
}
