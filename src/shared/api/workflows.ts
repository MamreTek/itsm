import type { Priority, TicketType } from './contracts';

export const nodeKinds = ['start', 'condition', 'approval', 'task', 'end'] as const;
export type NodeKind = (typeof nodeKinds)[number];
export const nodeText: Record<NodeKind, string> = {
  start: '开始', condition: '条件分支', approval: '审批', task: '处理', end: '结束',
};
export type Port = 'next' | 'yes' | 'no' | 'approved' | 'rejected';
export const portText: Record<Port, string> = {
  next: '下一步', yes: '满足条件', no: '不满足条件', approved: '审批通过', rejected: '审批拒绝',
};
export const portsFor: Record<NodeKind, Port[]> = {
  start: ['next'], condition: ['yes', 'no'], approval: ['approved', 'rejected'], task: ['next'], end: [],
};
export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  assigneeId?: string;
  condition?: { field: 'priority' | 'type'; value: string };
}
export interface FlowEdge { id: string; source: string; target: string; port: Port }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[] }
export interface WorkflowDraft { name: string; description: string; graph: FlowGraph }
export interface FlowIssue { code: string; message: string; nodeId?: string; edgeId?: string }
export interface FlowValidation { valid: boolean; issues: FlowIssue[] }
export interface Workflow extends WorkflowDraft {
  id: string;
  version: number;
  updatedAt: string;
  validation: FlowValidation;
}
export interface RunInputs { priority: Priority; type: TicketType }
export type RunAction = 'approve' | 'reject' | 'complete';
export interface RunEvent {
  id: string;
  nodeId: string;
  label: string;
  kind: NodeKind;
  at: string;
  outcome: 'entered' | 'yes' | 'no' | 'waiting' | 'approved' | 'rejected' | 'done' | 'completed';
  message: string;
}
export interface WorkflowRun {
  id: string;
  version: number;
  snapshot: Workflow;
  inputs: RunInputs;
  status: 'waiting' | 'completed';
  outcome: 'pending' | 'approved' | 'rejected' | 'done';
  currentNodeId: string | null;
  visitedEdgeIds: string[];
  trace: RunEvent[];
  createdAt: string;
  updatedAt: string;
}
