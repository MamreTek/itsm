import { actionText, priorities, statuses, ticketTypes, ticketViews } from '../shared/api/contracts';
import { assessSla, isActiveTicket, matchesView } from '../shared/api/sla';
import { createId } from '../shared/api/id';
import type {
  Activity,
  BulkAssignmentInput,
  BulkAssignmentResult,
  CreateTicket,
  Failure,
  SlaPolicy,
  Ticket,
  TicketStatus,
  TicketView,
  Transport,
} from '../shared/api/contracts';
import {
  people,
  policies as seedPolicies,
  seedInputs,
  services,
} from './seeds';

class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
const fail = (
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): never => {
  throw new Problem(status, code, message, fields);
};
const text = (
  value: unknown,
  min: number,
  max: number,
  field: string,
): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    return fail(422, 'VALIDATION_ERROR', '请检查填写内容', {
      [field]: `请输入 ${min}–${max} 个字符`,
    });
  return value.trim();
};
const enumValue = <T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T => {
  if (!values.includes(value as T))
    return fail(422, 'VALIDATION_ERROR', '不支持的字段值', {
      [field]: '请选择有效选项',
    });
  return value as T;
};
export function createMockServer({
  delay = 250,
  now = () => Date.now(),
}: { delay?: number; now?: () => number } = {}) {
  let rows: Ticket[] = [];
  let policies: SlaPolicy[] = structuredClone(seedPolicies);
  let sequence = 1000;
  let shouldFail = false;
  const timestamp = () => new Date(now()).toISOString();
  const activity = (
    kind: Activity['kind'],
    message: string,
    at = timestamp(),
  ): Activity => ({
    id: createId(),
    kind,
    message,
    actor: '演示处理人（模拟）',
    at,
  });
  const makeTicket = (input: CreateTicket, at = now()): Ticket => {
    const policy = policies.find((p) => p.priority === input.priority)!;
    const createdAt = new Date(at).toISOString();
    sequence += 1;
    return {
      ...input,
      id: createId(),
      number: `${input.type === 'incident' ? 'INC' : 'SR'}-${sequence}`,
      serviceId: input.serviceId || null,
      status: 'open',
      assigneeId: null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
      firstRespondedAt: null,
      resolvedAt: null,
      closedAt: null,
      sla: {
        ...policy,
        responseDueAt: new Date(
          at + policy.responseMinutes * 60000,
        ).toISOString(),
        resolutionDueAt: new Date(
          at + policy.resolutionMinutes * 60000,
        ).toISOString(),
      },
      activities: [activity('created', '创建工单（模拟数据）', createdAt)],
    };
  };
  const reset = () => {
    sequence = 1000;
    policies = structuredClone(seedPolicies);
    shouldFail = false;
    rows = seedInputs.map((input, index) =>
      makeTicket(input, now() - (index === 0 ? 5 : index + 1) * 3600000),
    );
    rows[1].assigneeId = people[1].id;
    rows[1].status = 'in_progress';
    rows[1].firstRespondedAt = rows[1].createdAt;
    rows[1].activities.push(
      activity('assigned', '分派给演示用户 B', rows[1].createdAt),
      activity('status', '开始处理：正在检查容量', rows[1].createdAt),
    );
    rows[4].status = 'resolved';
    rows[4].assigneeId = people[2].id;
    rows[4].firstRespondedAt = rows[4].createdAt;
    rows[4].resolvedAt = timestamp();
    rows[4].activities.push(activity('status', '已解决：已提供演示操作说明'));
  };
  reset();
  const assignTicket = (id: string, assigneeId: unknown, version: unknown, bulk = false): Ticket => {
    const ticket = rows.find(row => row.id === id);
    if (!ticket) return fail(404, 'NOT_FOUND', '工单不存在');
    if (!Number.isInteger(version) || version !== ticket.version) return fail(409, 'VERSION_CONFLICT', '工单已变更，请刷新后重试');
    if (!isActiveTicket(ticket)) return fail(409, 'INVALID_STATE', '只有待处理和处理中工单可分派');
    const person = people.find(item => item.id === assigneeId);
    if (!person) return fail(422, 'VALIDATION_ERROR', '请选择有效处理人');
    ticket.assigneeId = person.id;
    ticket.activities.push(activity('assigned', `${bulk ? '批量分派给' : '分派给'}${person.name}`));
    ticket.version += 1;
    ticket.updatedAt = timestamp();
    return ticket;
  };
  const transport: Transport = async (request) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const requestId = `mock-${createId()}`;
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify({ data, requestId }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
    try {
      if (request.signal.aborted)
        throw new DOMException('Aborted', 'AbortError');
      if (shouldFail) {
        shouldFail = false;
        fail(503, 'MOCK_UNAVAILABLE', '模拟服务暂时不可用，请重试');
      }
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      let body: Record<string, unknown> = {};
      if (method !== 'GET') {
        try {
          body = await request.json();
        } catch {
          fail(400, 'INVALID_JSON', '请求必须是 JSON 对象');
        }
        if (!body || Array.isArray(body) || typeof body !== 'object')
          fail(400, 'INVALID_JSON', '请求必须是 JSON 对象');
      }
      if (path === '/api/v1/catalog' && method === 'GET') return json(services);
      if (path === '/api/v1/directory' && method === 'GET') return json(people);
      if (path === '/api/v1/sla-policies' && method === 'GET')
        return json(policies);
      if (path === '/api/v1/tickets/bulk-assignment' && method === 'POST') {
        if (!people.some(person => person.id === body.assigneeId)) fail(422, 'VALIDATION_ERROR', '请选择有效处理人', { assigneeId: '处理人不存在' });
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) fail(422, 'VALIDATION_ERROR', '每次请选择 1–50 个工单');
        const items = body.items as BulkAssignmentInput['items'];
        if (!items.every(item => item && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200 && Number.isInteger(item.version) && item.version > 0) || new Set(items.map(item => item.id)).size !== items.length) fail(422, 'VALIDATION_ERROR', '目标必须包含有效 id 和版本，且不能重复');
        const result: BulkAssignmentResult = { succeeded: [], failed: [] };
        for (const item of items) {
          try { result.succeeded.push(assignTicket(item.id, body.assigneeId, item.version, true)); }
          catch (error) {
            if (!(error instanceof Problem)) throw error;
            result.failed.push({ id: item.id, status: error.status, code: error.code, message: error.message, currentVersion: rows.find(row => row.id === item.id)?.version });
          }
        }
        return json(result);
      }
      const policyMatch = path.match(/^\/api\/v1\/sla-policies\/(P[1-4])$/);
      if (policyMatch && method === 'PUT') {
        const policy = policies.find((p) => p.priority === policyMatch[1])!;
        if (body.version !== policy.version)
          fail(409, 'VERSION_CONFLICT', '策略已更新，请刷新后重试');
        const { responseMinutes: response, resolutionMinutes: resolution } =
          body;
        if (
          !Number.isInteger(response) ||
          !Number.isInteger(resolution) ||
          Number(response) < 1 ||
          Number(resolution) < Number(response) ||
          Number(resolution) > 43200
        )
          fail(
            422,
            'VALIDATION_ERROR',
            '响应须为正整数，解决时限须不小于响应且不超过 43200 分钟',
          );
        Object.assign(policy, {
          responseMinutes: response,
          resolutionMinutes: resolution,
          version: policy.version + 1,
        });
        return json(policy);
      }
      if (path === '/api/v1/tickets' && method === 'GET') {
        const p = url.searchParams;
        const evaluatedAt = now();
        const view = p.get('view') || 'all';
        if (!(ticketViews as readonly string[]).includes(view)) fail(400, 'INVALID_QUERY', '无效视图');
        for (const key of ['assigneeId', 'requesterId']) if (p.has(key) && !people.some(person => person.id === p.get(key))) fail(400, 'INVALID_QUERY', `无效 ${key}`);
        const integer = (key: string, fallback: number, max: number) => {
          const raw = p.get(key);
          const value = raw === null ? fallback : Number(raw);
          if (!Number.isInteger(value) || value < 1 || value > max)
            fail(400, 'INVALID_QUERY', `无效 ${key}`);
          return value;
        };
        const page = integer('page', 1, 100000);
        const pageSize = integer('pageSize', 10, 100);
        const filters = [
          ['status', statuses],
          ['priority', priorities],
          ['type', ticketTypes],
        ] as const;
        for (const [key, allowed] of filters)
          if (
            p.has(key) &&
            !(allowed as readonly string[]).includes(p.get(key)!)
          )
            fail(400, 'INVALID_QUERY', `无效 ${key}`);
        const sort = p.get('sort') || 'createdAt:desc';
        if (!['createdAt:asc', 'createdAt:desc'].includes(sort))
          fail(400, 'INVALID_QUERY', '无效排序');
        const q = (p.get('q') || '').trim().toLowerCase();
        if (q.length > 120) fail(400, 'INVALID_QUERY', '搜索最多 120 字');
        const filtered = rows
          .filter(
            (t) =>
              `${t.number} ${t.title}`.toLowerCase().includes(q) &&
              filters.every(([key]) => !p.has(key) || t[key] === p.get(key)) &&
              matchesView(t, view as TicketView, evaluatedAt) &&
              (!p.has('assigneeId') || t.assigneeId === p.get('assigneeId')) &&
              (!p.has('requesterId') || t.requesterId === p.get('requesterId')),
          )
          .sort(
            (a, b) =>
              (Date.parse(a.createdAt) - Date.parse(b.createdAt)) *
                (sort === 'createdAt:asc' ? 1 : -1) ||
              a.number.localeCompare(b.number),
          );
        const active = rows.filter(isActiveTicket);
        const breached = active.filter(t => assessSla(t, evaluatedAt).activeBreach).length;
        return json({
          evaluatedAt: new Date(evaluatedAt).toISOString(),
          items: filtered.slice((page - 1) * pageSize, page * pageSize),
          total: filtered.length,
          page,
          pageSize,
          summary: {
            active: active.length,
            unassigned: active.filter((t) => !t.assigneeId).length,
            breached,
            resolved: rows.filter((t) =>
              ['resolved', 'closed'].includes(t.status),
            ).length,
          },
        });
      }
      if (path === '/api/v1/tickets' && method === 'POST') {
        const title = text(body.title, 4, 120, 'title');
        const description = text(body.description, 10, 2000, 'description');
        const type = enumValue(body.type, ticketTypes, 'type');
        const priority = enumValue(body.priority, priorities, 'priority');
        if (!people.some((p) => p.id === body.requesterId))
          fail(422, 'VALIDATION_ERROR', '请求人不存在');
        if (
          body.serviceId &&
          (type !== 'service_request' ||
            !services.some((s) => s.id === body.serviceId))
        )
          fail(422, 'VALIDATION_ERROR', '服务目录不匹配');
        const row = makeTicket({
          title,
          description,
          type,
          priority,
          requesterId: body.requesterId as string,
          serviceId: body.serviceId as string | null,
        });
        rows.unshift(row);
        return json(row, 201);
      }
      const match = path.match(
        /^\/api\/v1\/tickets\/([^/]+)(?:\/(assignment|transitions|comments))?$/,
      );
      if (match) {
        const row = rows.find((r) => r.id === match[1]);
        if (!row) fail(404, 'NOT_FOUND', '工单不存在');
        const ticket = row!;
        if (!match[2] && method === 'GET') return json(ticket);
        const known =
          (match[2] === 'assignment' && method === 'PUT') ||
          (['transitions', 'comments'].includes(match[2]) && method === 'POST');
        if (!known) fail(404, 'NOT_FOUND', '接口不存在');
        if (!Number.isInteger(body.version) || body.version !== ticket.version)
          fail(409, 'VERSION_CONFLICT', '工单已变更，请刷新详情后重试');
        if (ticket.status === 'closed')
          fail(409, 'INVALID_STATE', '已关闭工单不能修改');
        if (match[2] === 'assignment') {
          return json(assignTicket(ticket.id, body.assigneeId, body.version));
        } else if (match[2] === 'comments') {
          const note = text(body.message, 1, 2000, 'message');
          ticket.activities.push(activity('comment', note));
        } else {
          const transitions: Record<
            string,
            { from: TicketStatus; to: TicketStatus }
          > = {
            start: { from: 'open', to: 'in_progress' },
            resolve: { from: 'in_progress', to: 'resolved' },
            close: { from: 'resolved', to: 'closed' },
            reopen: { from: 'resolved', to: 'in_progress' },
          };
          const action =
            typeof body.action === 'string' ? transitions[body.action] : null;
          if (!action || ticket.status !== action.from)
            fail(409, 'INVALID_STATE', '当前状态不支持此操作');
          if (!ticket.assigneeId)
            fail(422, 'ASSIGNEE_REQUIRED', '请先分派处理人');
          const note = text(body.note, 1, 2000, 'note');
          ticket.status = action!.to;
          if (!ticket.firstRespondedAt) ticket.firstRespondedAt = timestamp();
          if (body.action === 'resolve') ticket.resolvedAt = timestamp();
          if (body.action === 'close') ticket.closedAt = timestamp();
          if (body.action === 'reopen') ticket.resolvedAt = null;
          ticket.activities.push(activity('status', `${actionText[body.action as keyof typeof actionText]}：${note}`));
        }
        ticket.version += 1;
        ticket.updatedAt = timestamp();
        return json(ticket);
      }
      fail(404, 'NOT_FOUND', '接口不存在');
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      const body: Failure = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
        requestId,
      };
      return new Response(JSON.stringify(body), {
        status: error.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
    }
    throw new Error('Unreachable');
  };
  return {
    transport,
    reset,
    failNext: () => {
      shouldFail = true;
    },
  };
}
