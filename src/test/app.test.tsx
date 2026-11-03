import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import App from '../app/App';
import { api, mock } from '../shared/api/client';

beforeEach(() => {
  mock.reset();
  window.location.hash = '#/tickets';
});
it('shows the prototype boundary, searches an empty queue and recovers from a failed request', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByText('产品原型 / 模拟数据')).toBeInTheDocument();
  await screen.findByText('演示应用响应变慢');
  await user.click(screen.getByLabelText('搜索工单'));
  await user.paste('没有此工单');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  await screen.findByText('没有符合条件的记录，试试调整筛选或新建工单');
  await user.click(screen.getByRole('button', { name: '重置筛选' }));
  await screen.findByText('演示应用响应变慢');
  await user.click(screen.getByRole('button', { name: '模拟下一请求失败' }));
  await user.click(screen.getByRole('button', { name: '刷新' }));
  await screen.findByText('请求失败');
  await user.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('演示应用响应变慢');
});
it('validates a create form, keeps the draft on failure, and creates exactly one ticket after retry', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('演示应用响应变慢');
  await user.click(screen.getByRole('button', { name: '新建工单' }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: '提交工单' }),
    ).toBeEnabled(),
  );
  await user.click(within(dialog).getByRole('button', { name: '提交工单' }));
  await within(dialog).findByText('请输入 4–120 个字符的标题');
  await user.click(within(dialog).getByLabelText('工单标题'));
  await user.paste('新增演示故障流程');
  await user.click(within(dialog).getByLabelText('需求或故障描述'));
  await user.paste('这是用于验证提交失败后草稿保留的虚构描述。');
  await user.click(within(dialog).getByLabelText('请求人（虚构目录）'));
  await user.click(await screen.findByText('演示用户 A · 业务应用组'));
  mock.failNext();
  await user.click(within(dialog).getByRole('button', { name: '提交工单' }));
  await within(dialog).findByText(/模拟服务暂时不可用/);
  expect(within(dialog).getByLabelText('工单标题')).toHaveValue(
    '新增演示故障流程',
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: '提交工单' }),
    ).toBeEnabled(),
  );
  await user.click(
    await within(dialog).findByRole('button', { name: '提交工单' }),
  );
  await waitFor(() =>
    expect(
      screen
        .queryAllByRole('alert')
        .map((el) => el.textContent)
        .join('|'),
    ).not.toContain('MOCK_UNAVAILABLE'),
  );
  await screen.findByRole('heading', { name: '新增演示故障流程' });
  expect((await api.list({ q: '新增演示故障流程' })).total).toBe(1);
  expect(screen.getByText('先分派处理人，再开始处理。')).toBeInTheDocument();
});

it('shows partial bulk results and leaves a concurrently changed ticket with its latest owner', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('演示应用响应变慢');
  await user.click(screen.getByLabelText('选择 INC-1001'));
  await user.click(screen.getByLabelText('选择 SR-1003'));
  await screen.findByText('已选择本页 2 条工单');
  await waitFor(() => expect(screen.getByRole('button', { name: '批量分派' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '批量分派' }));
  const dialog = await screen.findByRole('dialog', { name: '批量分派' });
  const stale = (await api.list({ q: 'INC-1001' })).items[0];
  await api.assign(stale.id, 'person-demo-2', stale.version);
  await user.click(within(dialog).getByLabelText('目标处理人（虚构目录）'));
  await user.click(await screen.findByText('演示用户 C · 服务台'));
  await user.click(within(dialog).getByRole('button', { name: '确认批量分派' }));
  const result = await screen.findByRole('dialog', { name: '批量分派结果' });
  await within(result).findByText('成功 1 条，失败 1 条');
  expect(within(result).getByText(/VERSION_CONFLICT，当前版本 2/)).toBeInTheDocument();
  expect((await api.detail(stale.id)).assigneeId).toBe('person-demo-2');
  expect((await api.list({ q: 'SR-1003' })).items[0].assigneeId).toBe('person-demo-3');
  await user.click(within(result).getByRole('button', { name: '返回队列' }));
  await screen.findByText('演示应用响应变慢');
  expect(screen.getByRole('button', { name: '批量分派' })).toBeDisabled();
});
