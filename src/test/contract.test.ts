import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockServer } from '../mocks/transport';
import { createClient } from '../shared/api/client';
import type { CreateTicket } from '../shared/api/contracts';

const now = () => Date.parse('2026-11-03T12:00:00Z');
const input: CreateTicket = {
  title: '申请演示环境资源',
  description: '需要一个用于验证服务台流程的模拟联调环境。',
  type: 'service_request',
  priority: 'P3',
  requesterId: 'person-demo-1',
  serviceId: 'svc-workspace',
};
let server: ReturnType<typeof createMockServer>;
let api: ReturnType<typeof createClient>;
beforeEach(() => {
  server = createMockServer({ delay: 0, now });
  api = createClient(server.transport);
});

describe('v1 workflow contract', () => {
  it('keeps Mock tickets usable on private HTTP origins without randomUUID', async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
    });
    try {
      const localApi = createClient(
        createMockServer({ delay: 0, now }).transport,
      );
      const ticket = await localApi.create(input);
      expect(ticket.id).toBeTruthy();
      expect((await localApi.detail(ticket.id)).number).toBe(ticket.number);
      const assigned = await localApi.assign(
        ticket.id,
        'person-demo-2',
        ticket.version,
      );
      expect(
        (
          await localApi.transition(
            ticket.id,
            'start',
            '演示处理',
            assigned.version,
          )
        ).status,
      ).toBe('in_progress');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('creates a catalog ticket, assigns, processes, records, resolves and closes it', async () => {
    let ticket = await api.create(input);
    expect(ticket).toMatchObject({
      status: 'open',
      version: 1,
      serviceId: 'svc-workspace',
    });
    expect(ticket.sla.resolutionDueAt).toBe('2026-11-04T12:00:00.000Z');
    expect((await api.list({ q: ticket.number })).items[0].id).toBe(ticket.id);
    ticket = await api.assign(ticket.id, 'person-demo-2', ticket.version);
    ticket = await api.transition(
      ticket.id,
      'start',
      '开始检查演示需求',
      ticket.version,
    );
    expect(ticket.firstRespondedAt).toBe('2026-11-03T12:00:00.000Z');
    ticket = await api.comment(
      ticket.id,
      '模拟环境已准备，等待复核。',
      ticket.version,
    );
    ticket = await api.transition(
      ticket.id,
      'resolve',
      '演示需求已满足',
      ticket.version,
    );
    ticket = await api.transition(
      ticket.id,
      'close',
      '请求人确认完成',
      ticket.version,
    );
    expect(ticket.status).toBe('closed');
    expect(ticket.activities).toHaveLength(6);
    expect(
      ticket.activities.some((a) => a.message.includes('模拟环境已准备')),
    ).toBe(true);
    await expect(
      api.comment(ticket.id, '尝试修改', ticket.version),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });
  it('rejects missing ownership, stale versions and invalid transitions atomically', async () => {
    const ticket = await api.create(input);
    await expect(
      api.transition(ticket.id, 'start', '开始', ticket.version),
    ).rejects.toMatchObject({ status: 422, code: 'ASSIGNEE_REQUIRED' });
    const assigned = await api.assign(
      ticket.id,
      'person-demo-2',
      ticket.version,
    );
    await expect(
      api.transition(ticket.id, 'start', '开始', ticket.version),
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    await expect(
      api.transition(ticket.id, 'close', '关闭', assigned.version),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    await expect(
      api.transition(ticket.id, 'start', ' ', assigned.version),
    ).rejects.toMatchObject({ status: 422 });
    expect(await api.detail(ticket.id)).toEqual(assigned);
  });
  it('keeps original SLA deadlines across policy edits and reopening', async () => {
    let old = await api.create(input);
    const [, , policy] = await api.policies();
    await api.updatePolicy('P3', {
      responseMinutes: 10,
      resolutionMinutes: 30,
      version: policy.version,
    });
    const fresh = await api.create(input);
    expect(fresh.sla.resolutionMinutes).toBe(30);
    expect((await api.detail(old.id)).sla.resolutionDueAt).toBe(
      old.sla.resolutionDueAt,
    );
    old = await api.assign(old.id, 'person-demo-2', old.version);
    old = await api.transition(old.id, 'start', '开始', old.version);
    old = await api.transition(old.id, 'resolve', '已处理', old.version);
    const snapshot = old.sla;
    old = await api.transition(old.id, 'reopen', '需要补充检查', old.version);
    expect(old.sla).toEqual(snapshot);
    expect(old.resolvedAt).toBeNull();
    expect(old.status).toBe('in_progress');
  });
  it('preserves state after service failure and allows retry without duplicate creation', async () => {
    const count = (await api.list()).total;
    server.failNext();
    await expect(api.create(input)).rejects.toMatchObject({
      status: 503,
      code: 'MOCK_UNAVAILABLE',
      requestId: expect.stringMatching(/^mock-/),
    });
    expect((await api.list()).total).toBe(count);
    await api.create(input);
    expect((await api.list()).total).toBe(count + 1);
  });
  it('validates fields, directory/service references, SLA targets and stale policies', async () => {
    for (const invalid of [
      { ...input, title: 'a' },
      { ...input, description: ' ' },
      { ...input, requesterId: 'unknown' },
      { ...input, type: 'incident' as const },
      { ...input, serviceId: 'unknown' },
    ])
      await expect(api.create(invalid)).rejects.toMatchObject({ status: 422 });
    await expect(
      api.updatePolicy('P1', {
        responseMinutes: 50,
        resolutionMinutes: 10,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await api.policies())[0].version).toBe(1);
    await api.updatePolicy('P1', {
      responseMinutes: 10,
      resolutionMinutes: 20,
      version: 1,
    });
    await expect(
      api.updatePolicy('P1', {
        responseMinutes: 5,
        resolutionMinutes: 10,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('applies filters, sorting and pagination, and returns consistent empty/invalid results', async () => {
    const page1 = await api.list({
      page: 1,
      pageSize: 2,
      sort: 'createdAt:asc',
    });
    const page2 = await api.list({
      page: 2,
      pageSize: 2,
      sort: 'createdAt:asc',
    });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    expect(
      page2.items.every((t) => !page1.items.some((p) => p.id === t.id)),
    ).toBe(true);
    expect(
      (await api.list({ status: 'resolved' })).items.every(
        (t) => t.status === 'resolved',
      ),
    ).toBe(true);
    expect((await api.list({ q: 'does-not-exist' })).total).toBe(0);
    expect((await api.list({ priority: 'P1' })).summary.active).toBe(4);
    await expect(api.list({ page: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(api.detail('missing')).rejects.toMatchObject({ status: 404 });
  });
  it('returns public envelope/status/header semantics and handles malformed requests', async () => {
    const good = await server.transport(
      new Request('http://itsm.mock.local/api/v1/tickets', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    expect(good.status).toBe(201);
    const body = await good.json();
    expect(good.headers.get('X-Request-ID')).toBe(body.requestId);
    expect(body.data.id).toBeTruthy();
    const bad = await server.transport(
      new Request('http://itsm.mock.local/api/v1/tickets', {
        method: 'POST',
        body: 'not-json',
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('INVALID_JSON');
    for (const query of [
      'pageSize=101',
      'sort=invalid',
      'priority=P9',
      'status=unknown',
    ])
      expect(
        (
          await server.transport(
            new Request(`http://itsm.mock.local/api/v1/tickets?${query}`),
          )
        ).status,
      ).toBe(400);
    server.reset();
    expect((await api.list()).total).toBe(5);
  });
});
