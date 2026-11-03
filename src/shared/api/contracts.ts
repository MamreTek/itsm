/** v1 contract. Mock and a future HTTP backend must preserve these semantics. */
export const priorities = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof priorities)[number];
export const statuses = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof statuses)[number];
export const ticketTypes = ['incident', 'service_request'] as const;
export type TicketType = (typeof ticketTypes)[number];
export type Action = 'start' | 'resolve' | 'close' | 'reopen';
export interface Person {
  id: string;
  name: string;
  team: string;
}
export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  template: string;
  priority: Priority;
}
export interface SlaPolicy {
  priority: Priority;
  responseMinutes: number;
  resolutionMinutes: number;
  version: number;
}
export interface Activity {
  id: string;
  kind: 'created' | 'assigned' | 'status' | 'comment';
  actor: string;
  message: string;
  at: string;
}
export interface Ticket {
  id: string;
  number: string;
  title: string;
  description: string;
  type: TicketType;
  priority: Priority;
  status: TicketStatus;
  requesterId: string;
  assigneeId: string | null;
  serviceId: string | null;
  createdAt: string;
  updatedAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  sla: SlaPolicy & { responseDueAt: string; resolutionDueAt: string };
  version: number;
  activities: Activity[];
}
export interface CreateTicket {
  title: string;
  description: string;
  type: TicketType;
  priority: Priority;
  requesterId: string;
  serviceId?: string | null;
}
export interface TicketQuery {
  q?: string;
  status?: TicketStatus;
  priority?: Priority;
  type?: TicketType;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt:desc' | 'createdAt:asc';
}
export interface TicketList {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    active: number;
    unassigned: number;
    breached: number;
    resolved: number;
  };
}
export interface Success<T> {
  data: T;
  requestId: string;
}
export interface Failure {
  error: { code: string; message: string; fields?: Record<string, string> };
  requestId: string;
}
export type Transport = (request: Request) => Promise<Response>;
export const statusText: Record<TicketStatus, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};
export const typeText: Record<TicketType, string> = {
  incident: '故障事件',
  service_request: '服务请求',
};
