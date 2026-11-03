import { beforeEach, describe, expect, it } from 'vitest';
import { createMockServer } from '../mocks/transport';
import { people } from '../mocks/seeds';
import { createClient } from '../shared/api/client';
import { exampleDraft, validateWorkflow } from '../shared/workflow/model';
import type { WorkflowDraft } from '../shared/api/workflows';

const now = () => Date.parse('2026-11-03T12:00:00Z');
let server: ReturnType<typeof createMockServer>;
let api: ReturnType<typeof createClient>;
beforeEach(() => { server = createMockServer({ delay: 0, now }); api = createClient(server.transport); });

describe('workflow graph validation', () => {
  it('accepts the independently authored branching template', () => {
    expect(validateWorkflow(exampleDraft(), people)).toEqual({ valid: true, issues: [] });
  });
  it('finds orphan nodes, missing owners, missing exits and empty labels', () => {
    const draft = exampleDraft();
    draft.graph.nodes.push({ id: 'orphan', kind: 'approval', label: '', x: 0, y: 0 });
    expect(validateWorkflow(draft, people).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['UNREACHABLE', 'NO_END_PATH', 'ASSIGNEE_REQUIRED', 'PORT_COUNT', 'LABEL_REQUIRED']));
  });
  it('rejects cycles, duplicate identifiers, ambiguous ports, dangling and illegal edges', () => {
    const draft = exampleDraft();
    draft.graph.nodes.push({ ...draft.graph.nodes[0] });
    draft.graph.edges.push(
      { id: 'e1', source: 'priority', target: 'start', port: 'yes' },
      { id: 'end-out', source: 'end', target: 'missing', port: 'next' },
      { id: 'self', source: 'urgent', target: 'urgent', port: 'next' },
    );
    expect(validateWorkflow(draft, people).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['START_COUNT', 'DUPLICATE_NODE', 'DUPLICATE_EDGE', 'PORT_COUNT', 'INVALID_PORT', 'DANGLING_EDGE', 'SELF_EDGE', 'START_INCOMING', 'CYCLE']));
  });
  it('requires start/end nodes and typed enum conditions without evaluating expressions', () => {
    const draft = exampleDraft();
    draft.graph.nodes = draft.graph.nodes.filter(node => !['start', 'end'].includes(node.kind));
    draft.graph.nodes.find(node => node.kind === 'condition')!.condition!.value = 'globalThis.evil()';
    expect(validateWorkflow(draft, people).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['START_COUNT', 'END_REQUIRED', 'CONDITION_REQUIRED']));
  });
});

describe('workflow Mock API and immutable simulation', () => {
  it('stores incomplete semantic drafts, reports validation issues and prevents starting them', async () => {
    const draft = exampleDraft();
    draft.graph.edges = [];
    const created = await api.createWorkflow(draft);
    expect(created.version).toBe(1);
    expect(created.validation.valid).toBe(false);
    expect(await api.validateWorkflow(draft)).toEqual(created.validation);
    expect(await api.workflow(created.id)).toEqual(created);
    await expect(api.createRun(created.id, created.version, { priority: 'P1', type: 'incident' })).rejects.toMatchObject({ status: 422, code: 'INVALID_GRAPH' });
  });
  it('guards draft optimistic versions, malformed shapes and graph limits before writes', async () => {
    const workflow = (await api.workflows())[0];
    const saved = await api.saveWorkflow(workflow.id, { ...workflow, name: '更新后的演示流程' }, workflow.version);
    expect(saved.version).toBe(2);
    await expect(api.saveWorkflow(workflow.id, workflow, 1)).rejects.toMatchObject({ status: 409 });
    const invalid: unknown[] = [
      { ...workflow, graph: { nodes: Array(31).fill(workflow.graph.nodes[0]), edges: [] } },
      { ...workflow, graph: { nodes: [], edges: Array(81).fill(workflow.graph.edges[0]) } },
      { ...workflow, graph: { nodes: [{ ...workflow.graph.nodes[0], x: -1 }], edges: [] } },
      { ...workflow, graph: { nodes: [{ ...workflow.graph.nodes[0], kind: 'script' }], edges: [] } },
      { ...workflow, graph: { ...workflow.graph, edges: [{ ...workflow.graph.edges[0], port: ['next'] }] } },
    ];
    for (const draft of invalid) await expect(api.saveWorkflow(workflow.id, draft as WorkflowDraft, 2)).rejects.toMatchObject({ status: 422 });
    expect(await api.workflow(workflow.id)).toEqual(saved);
  });
  it('routes P1 through approval and task completion while retaining a saved-version snapshot', async () => {
    const workflow = (await api.workflows())[0];
    let run = await api.createRun(workflow.id, workflow.version, { priority: 'P1', type: 'service_request' });
    expect(run.currentNodeId).toBe('approval');
    expect(run.visitedEdgeIds).toEqual(['e1', 'e2']);
    const changed = structuredClone(workflow);
    changed.graph.nodes.find(node => node.id === 'approval')!.label = '修改后的审批';
    await api.saveWorkflow(workflow.id, changed, workflow.version);
    expect((await api.run(run.id)).snapshot).toEqual(workflow);
    run = await api.runAction(run.id, run.version, 'approve', '模拟确认通过');
    expect(run.currentNodeId).toBe('urgent');
    run = await api.runAction(run.id, run.version, 'complete', '模拟处理完成');
    expect(run).toMatchObject({ status: 'completed', outcome: 'approved', version: 3, currentNodeId: null });
    expect(run.snapshot.graph.nodes.find(node => node.id === 'approval')!.label).toBe('服务台审批');
    expect(run.trace.map(event => event.outcome)).toEqual(['entered', 'yes', 'waiting', 'approved', 'waiting', 'done', 'completed']);
    await expect(api.runAction(run.id, run.version, 'complete', '重复完成')).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    expect(await api.run(run.id)).toEqual(run);
  });
  it('follows the explicit rejection exit and non-P1 task branch', async () => {
    const workflow = (await api.workflows())[0];
    const approval = await api.createRun(workflow.id, 1, { priority: 'P1', type: 'incident' });
    const rejected = await api.runAction(approval.id, 1, 'reject', '演示拒绝原因');
    expect(rejected).toMatchObject({ status: 'completed', outcome: 'rejected', visitedEdgeIds: ['e1', 'e2', 'e5'] });
    const standard = await api.createRun(workflow.id, 1, { priority: 'P3', type: 'service_request' });
    expect(standard.currentNodeId).toBe('standard');
    expect(standard.trace[1].outcome).toBe('no');
    const done = await api.runAction(standard.id, 1, 'complete', '演示标准处理');
    expect(done).toMatchObject({ status: 'completed', outcome: 'done', visitedEdgeIds: ['e1', 'e3', 'e6'] });
  });
  it('validates type conditions and immediately finishes a valid start-to-end graph', async () => {
    const draft = exampleDraft();
    draft.graph.nodes.find(node => node.kind === 'condition')!.condition = { field: 'type', value: 'incident' };
    const byType = await api.createWorkflow(draft);
    expect((await api.createRun(byType.id, 1, { priority: 'P4', type: 'incident' })).currentNodeId).toBe('approval');
    const direct = await api.createWorkflow({ name: '直接结束', description: '', graph: { nodes: draft.graph.nodes.filter(node => ['start', 'end'].includes(node.kind)), edges: [{ id: 'direct', source: 'start', target: 'end', port: 'next' }] } });
    expect((await api.createRun(direct.id, 1, { priority: 'P4', type: 'incident' })).status).toBe('completed');
  });
  it('rejects stale, invalid and failed actions without advancing and accepts a manual retry once', async () => {
    const workflow = (await api.workflows())[0];
    const initial = await api.createRun(workflow.id, 1, { priority: 'P1', type: 'incident' });
    for (const action of [
      () => api.runAction(initial.id, 0, 'approve', '过期'),
      () => api.runAction(initial.id, 1, 'complete', '错误节点动作'),
      () => api.runAction(initial.id, 1, 'approve', ' '),
    ]) {
      await expect(action()).rejects.toBeDefined();
      expect(await api.run(initial.id)).toEqual(initial);
    }
    server.failNext();
    await expect(api.runAction(initial.id, 1, 'approve', '模拟重试')).rejects.toMatchObject({ status: 503 });
    expect(await api.run(initial.id)).toEqual(initial);
    const retried = await api.runAction(initial.id, 1, 'approve', '模拟重试');
    expect(retried.version).toBe(2);
    expect(retried.trace.filter(event => event.outcome === 'approved')).toHaveLength(1);
    await expect(api.runAction(initial.id, 1, 'reject', '并发拒绝')).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(await api.run(initial.id)).toEqual(retried);
  });
  it('preserves drafts after save failure, checks references and resets both models', async () => {
    const workflow = (await api.workflows())[0];
    server.failNext();
    await expect(api.saveWorkflow(workflow.id, { ...workflow, name: '失败的更新' }, 1)).rejects.toMatchObject({ status: 503 });
    expect(await api.workflow(workflow.id)).toEqual(workflow);
    await expect(api.createRun(workflow.id, 0, { priority: 'P1', type: 'incident' })).rejects.toMatchObject({ status: 409 });
    await expect(api.createRun('missing', 1, { priority: 'P1', type: 'incident' })).rejects.toMatchObject({ status: 404 });
    await expect(api.createRun(workflow.id, 1, { priority: 'P9', type: 'incident' } as never)).rejects.toMatchObject({ status: 422 });
    const run = await api.createRun(workflow.id, 1, { priority: 'P1', type: 'incident' });
    await api.createWorkflow(exampleDraft());
    server.reset();
    expect(await api.workflows()).toHaveLength(1);
    await expect(api.run(run.id)).rejects.toMatchObject({ status: 404 });
    expect((await api.list()).total).toBe(5);
  });
  it('stores only contract fields and never treats extra payload properties as executable configuration', async () => {
    const draft = exampleDraft();
    const extra = { ...draft, privateExtra: 'discard', graph: { ...draft.graph, script: 'discard', nodes: draft.graph.nodes.map(node => ({ ...node, extra: 'discard' })) } };
    const created = await api.createWorkflow(extra);
    expect(created).not.toHaveProperty('privateExtra');
    expect(created.graph).not.toHaveProperty('script');
    expect(created.graph.nodes[0]).not.toHaveProperty('extra');
    const run = await api.createRun(created.id, 1, { priority: 'P3', type: 'incident', script: 'discard' } as never);
    expect(run.inputs).toEqual({ priority: 'P3', type: 'incident' });
    expect(run.currentNodeId).toBe('standard');
  });
});
