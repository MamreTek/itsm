import { priorities, ticketTypes } from '../shared/api/contracts';
import { createId } from '../shared/api/id';
import { nodeKinds } from '../shared/api/workflows';
import type { FlowGraph, FlowNode, RunAction, RunInputs, Workflow, WorkflowDraft, WorkflowRun } from '../shared/api/workflows';
import { exampleDraft, validateWorkflow } from '../shared/workflow/model';
import { people } from './seeds';

export class WorkflowProblem extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => { throw new WorkflowProblem(status, code, message); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shortText = (value: unknown, limit: number, required = false): value is string =>
  typeof value === 'string' && value.length <= limit && (!required || value.trim().length > 0);

function parseDraft(body: Record<string, unknown>): WorkflowDraft {
  const graph = body.graph;
  if (!shortText(body.name, 80) || !shortText(body.description, 1000) || !object(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    return fail(422, 'VALIDATION_ERROR', '请提交名称、说明和有效的流程图对象');
  if (graph.nodes.length > 30 || graph.edges.length > 80) return fail(422, 'GRAPH_LIMIT', '原型最多支持 30 个节点、80 条连线');
  for (const node of graph.nodes) {
    if (!object(node) || !shortText(node.id, 80, true) || !nodeKinds.includes(node.kind as FlowNode['kind']) || !shortText(node.label, 60)
      || typeof node.x !== 'number' || !Number.isFinite(node.x) || node.x < 0 || node.x > 900
      || typeof node.y !== 'number' || !Number.isFinite(node.y) || node.y < 0 || node.y > 700
      || (node.assigneeId !== undefined && !shortText(node.assigneeId, 100))
      || (node.condition !== undefined && (!object(node.condition) || typeof node.condition.field !== 'string' || !['priority', 'type'].includes(node.condition.field) || !shortText(node.condition.value, 80))))
      return fail(422, 'VALIDATION_ERROR', '节点类型、坐标或属性格式无效');
  }
  for (const edge of graph.edges) {
    if (!object(edge) || !shortText(edge.id, 80, true) || !shortText(edge.source, 80, true) || !shortText(edge.target, 80, true)
      || typeof edge.port !== 'string' || !['next', 'yes', 'no', 'approved', 'rejected'].includes(edge.port))
      return fail(422, 'VALIDATION_ERROR', '连线格式无效');
  }
  const checked = graph as unknown as FlowGraph;
  return {
    name: body.name.trim(), description: body.description.trim(),
    graph: {
      nodes: checked.nodes.map(node => ({ id: node.id, kind: node.kind, label: node.label, x: node.x, y: node.y,
        ...(node.assigneeId === undefined ? {} : { assigneeId: node.assigneeId }),
        ...(node.condition ? { condition: { field: node.condition.field, value: node.condition.value } } : {}) })),
      edges: checked.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, port: edge.port })),
    },
  };
}

export function createWorkflowStore(now: () => number) {
  let workflows: Workflow[] = [];
  let runs: WorkflowRun[] = [];
  const at = () => new Date(now()).toISOString();
  const reset = () => {
    const draft = exampleDraft();
    workflows = [{ ...draft, id: 'workflow-demo', version: 1, updatedAt: at(), validation: validateWorkflow(draft, people) }];
    runs = [];
  };
  reset();
  const checkVersion = (expected: unknown, actual: number) => {
    if (!Number.isInteger(expected) || expected !== actual) fail(409, 'VERSION_CONFLICT', '记录已变更，请读取最新版本后重试');
  };
  const record = (run: WorkflowRun, node: FlowNode, outcome: WorkflowRun['trace'][number]['outcome'], message: string) =>
    run.trace.push({ id: createId(), nodeId: node.id, label: node.label, kind: node.kind, at: at(), outcome, message });
  const follow = (run: WorkflowRun, node: FlowNode, port: string) => {
    const edge = run.snapshot.graph.edges.find(item => item.source === node.id && item.port === port);
    if (!edge) return fail(422, 'INVALID_GRAPH', '冻结流程缺少出口，无法继续');
    run.visitedEdgeIds.push(edge.id);
    run.currentNodeId = edge.target;
  };
  const advance = (run: WorkflowRun) => {
    for (let count = 0; count <= 30; count += 1) {
      const node = run.snapshot.graph.nodes.find(item => item.id === run.currentNodeId);
      if (!node) return fail(422, 'INVALID_GRAPH', '运行节点不存在');
      if (node.kind === 'approval' || node.kind === 'task') {
        run.status = 'waiting';
        record(run, node, 'waiting', '等待模拟操作，不发送真实任务');
        return;
      }
      if (node.kind === 'end') {
        run.status = 'completed';
        run.currentNodeId = null;
        if (run.outcome === 'pending') run.outcome = 'done';
        record(run, node, 'completed', '模拟流程已结束');
        return;
      }
      if (node.kind === 'condition') {
        const condition = node.condition!;
        const matched = run.inputs[condition.field] === condition.value;
        record(run, node, matched ? 'yes' : 'no', `${condition.field} 等于 ${condition.value}：${matched ? '满足' : '不满足'}`);
        follow(run, node, matched ? 'yes' : 'no');
      } else {
        record(run, node, 'entered', '开始模拟');
        follow(run, node, 'next');
      }
    }
    fail(422, 'INVALID_GRAPH', '流程超出模拟步数限制');
  };
  const handle = (path: string, method: string, body: Record<string, unknown>): { data: unknown; status?: number } | undefined => {
    if (path === '/api/v1/workflows/validate' && method === 'POST') return { data: validateWorkflow(parseDraft(body), people) };
    if (path === '/api/v1/workflows' && method === 'GET') return { data: workflows };
    if (path === '/api/v1/workflows' && method === 'POST') {
      const draft = parseDraft(body);
      const workflow: Workflow = { ...draft, id: createId(), version: 1, updatedAt: at(), validation: validateWorkflow(draft, people) };
      workflows.push(workflow);
      return { data: workflow, status: 201 };
    }
    const workflowMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)$/);
    if (workflowMatch && ['GET', 'PUT'].includes(method)) {
      const workflow = workflows.find(item => item.id === workflowMatch[1]);
      if (!workflow) return fail(404, 'NOT_FOUND', '流程不存在');
      if (method === 'GET') return { data: workflow };
      checkVersion(body.version, workflow.version);
      const draft = parseDraft(body);
      Object.assign(workflow, draft, { version: workflow.version + 1, updatedAt: at(), validation: validateWorkflow(draft, people) });
      return { data: workflow };
    }
    if (path === '/api/v1/workflow-runs' && method === 'POST') {
      const workflow = workflows.find(item => item.id === body.workflowId);
      if (!workflow) return fail(404, 'NOT_FOUND', '流程不存在');
      checkVersion(body.workflowVersion, workflow.version);
      if (!workflow.validation.valid) return fail(422, 'INVALID_GRAPH', '请先修复流程校验错误，再运行已保存版本');
      if (!object(body.inputs) || !priorities.includes(body.inputs.priority as never) || !ticketTypes.includes(body.inputs.type as never))
        return fail(422, 'VALIDATION_ERROR', '请选择有效的优先级与工单类型');
      const inputs = body.inputs as unknown as RunInputs;
      const run: WorkflowRun = {
        id: createId(), version: 1, snapshot: structuredClone(workflow), inputs: { priority: inputs.priority, type: inputs.type },
        status: 'waiting', outcome: 'pending', currentNodeId: workflow.graph.nodes.find(node => node.kind === 'start')!.id,
        visitedEdgeIds: [], trace: [], createdAt: at(), updatedAt: at(),
      };
      advance(run);
      runs.push(run);
      return { data: run, status: 201 };
    }
    const runMatch = path.match(/^\/api\/v1\/workflow-runs\/([^/]+)(?:\/(actions))?$/);
    if (runMatch && ((!runMatch[2] && method === 'GET') || (runMatch[2] && method === 'POST'))) {
      const current = runs.find(item => item.id === runMatch[1]);
      if (!current) return fail(404, 'NOT_FOUND', '模拟实例不存在');
      if (!runMatch[2]) return { data: current };
      checkVersion(body.version, current.version);
      if (current.status !== 'waiting') return fail(409, 'INVALID_STATE', '模拟已结束，不能继续操作');
      const run = structuredClone(current);
      const node = run.snapshot.graph.nodes.find(item => item.id === run.currentNodeId)!;
      const action = body.action as RunAction;
      if ((node.kind === 'approval' && !['approve', 'reject'].includes(action)) || (node.kind === 'task' && action !== 'complete'))
        return fail(409, 'INVALID_STATE', '当前节点不支持此动作');
      if (!shortText(body.note, 1000, true)) return fail(422, 'VALIDATION_ERROR', '请填写 1–1000 字的模拟操作说明');
      const outcome = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'done';
      record(run, node, outcome, body.note.trim());
      if (action === 'reject') run.outcome = 'rejected';
      else if (action === 'approve' && run.outcome !== 'rejected') run.outcome = 'approved';
      follow(run, node, action === 'complete' ? 'next' : outcome);
      advance(run);
      run.version += 1;
      run.updatedAt = at();
      Object.assign(current, run);
      return { data: current };
    }
    return undefined;
  };
  return { reset, handle };
}
