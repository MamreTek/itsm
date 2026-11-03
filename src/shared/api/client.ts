import type {
  Action,
  BulkAssignmentInput,
  BulkAssignmentResult,
  CreateTicket,
  Failure,
  Person,
  Priority,
  Service,
  SlaPolicy,
  Success,
  Ticket,
  TicketList,
  TicketQuery,
  Transport,
} from './contracts';
import { createMockServer } from '../../mocks/transport';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function createClient(transport: Transport) {
  const request = async <T>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await transport(
        new Request(`http://itsm.mock.local/api/v1${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        }),
      );
      const json: Success<T> | Failure = await response.json();
      if ('error' in json)
        throw new ApiError(
          response.status,
          json.error.code,
          json.error.message,
          json.requestId,
          json.error.fields,
        );
      if (!response.ok)
        throw new ApiError(
          response.status,
          'HTTP_ERROR',
          '请求未成功',
          json.requestId,
        );
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    list: (query: TicketQuery = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== '') params.set(key, String(value));
      });
      return request<TicketList>(`/tickets?${params}`);
    },
    detail: (id: string) =>
      request<Ticket>(`/tickets/${encodeURIComponent(id)}`),
    create: (input: CreateTicket) => request<Ticket>('/tickets', 'POST', input),
    assign: (id: string, assigneeId: string, version: number) =>
      request<Ticket>(`/tickets/${encodeURIComponent(id)}/assignment`, 'PUT', {
        assigneeId,
        version,
      }),
    bulkAssign: (input: BulkAssignmentInput) => request<BulkAssignmentResult>('/tickets/bulk-assignment', 'POST', input),
    transition: (id: string, action: Action, note: string, version: number) =>
      request<Ticket>(
        `/tickets/${encodeURIComponent(id)}/transitions`,
        'POST',
        { action, note, version },
      ),
    comment: (id: string, message: string, version: number) =>
      request<Ticket>(`/tickets/${encodeURIComponent(id)}/comments`, 'POST', {
        message,
        version,
      }),
    catalog: () => request<Service[]>('/catalog'),
    directory: () => request<Person[]>('/directory'),
    policies: () => request<SlaPolicy[]>('/sla-policies'),
    updatePolicy: (priority: Priority, policy: Omit<SlaPolicy, 'priority'>) =>
      request<SlaPolicy>(`/sla-policies/${priority}`, 'PUT', policy),
  };
}
// Deliberately Mock-only: no real credentials, backend or automatic production switch.
export const mock = createMockServer();
export const api = createClient(mock.transport);
export function errorText(error: unknown) {
  if (error instanceof ApiError)
    return `${error.message}（${error.code} / ${error.requestId}）`;
  return '请求失败或超时，请重试';
}
