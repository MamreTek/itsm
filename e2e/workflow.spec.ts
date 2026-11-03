import { expect, test, type Page } from '@playwright/test';

async function openMenu(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  if (!(await link.isVisible()))
    await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'IT 服务管理' })).toBeHidden();
}

test('catalog request completes the service desk workflow with retry and no page overflow', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) apiRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByText('演示应用响应变慢')).toBeVisible();
  await expect(page.getByText('产品原型 / 模拟数据')).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-queue.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await openMenu(page, '服务目录');
  await page.getByRole('button', { name: '申请服务' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('工单标题').fill('完整流程演示申请');
  await dialog
    .getByLabel('需求或故障描述')
    .fill('申请一个虚构联调环境，用于验证 ITSM 完整业务流程。');
  await dialog.getByLabel('请求人（虚构目录）').click();
  await page.getByText('演示用户 A · 业务应用组', { exact: true }).click();
  await dialog.getByRole('button', { name: '提交工单' }).click();
  await expect(
    page.getByRole('heading', { name: '完整流程演示申请' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '开始处理' })).toBeDisabled();
  await page.getByLabel('选择处理人').click();
  await page.getByText('演示用户 B · 基础设施组', { exact: true }).click();
  await page.getByRole('button', { name: '确认分派' }).click();
  await expect(page.getByRole('button', { name: '开始处理' })).toBeEnabled();
  await page.getByRole('button', { name: '开始处理' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('处理说明')
    .fill('开始确认申请需求与演示范围');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认并记录' })
    .click();
  await expect(page.getByRole('button', { name: '解决工单' })).toBeVisible();
  await page.getByLabel('追加处理记录').fill('演示环境已完成，等待最终复核。');
  await page.getByRole('button', { name: '添加记录' }).click();
  await expect(
    page.getByText('演示环境已完成，等待最终复核。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '解决工单' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('处理说明')
    .fill('需求已经通过模拟交付验证');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认并记录' })
    .click();
  await expect(page.getByRole('button', { name: '关闭工单' })).toBeVisible();
  await page.getByRole('button', { name: '关闭工单' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('处理说明')
    .fill('演示用户确认完成');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认并记录' })
    .click();
  await expect(page.getByText('工单已关闭，处理记录只读')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/${info.project.name}-completed.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: /返回工单队列/ }).click();
  await expect(page.getByText('完整流程演示申请')).toBeVisible();
  await page.getByRole('button', { name: '模拟下一请求失败' }).click();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('请求失败', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByText('完整流程演示申请')).toBeVisible();
  await expect(page.getByText('产品原型 / 模拟数据')).toBeVisible();
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
});

test('SLA validation, policy save, reset confirmation and empty queue work', async ({
  page,
}) => {
  await page.goto('/#/sla');
  await page.getByRole('button', { name: '编辑 P3' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('首次响应时限（分钟）').fill('60');
  await dialog.getByLabel('解决时限（分钟）').fill('30');
  await dialog.getByRole('button', { name: '保存策略' }).click();
  await expect(dialog.getByText('解决时限不能短于响应时限')).toBeVisible();
  await dialog.getByLabel('解决时限（分钟）').fill('120');
  await dialog.getByRole('button', { name: '保存策略' }).click();
  await expect(page.getByText('120 分钟', { exact: true })).toBeVisible();
  await openMenu(page, '工单队列');
  await page.getByLabel('搜索工单').fill('不存在的演示记录');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(
    page.getByText('没有符合条件的记录，试试调整筛选或新建工单'),
  ).toBeVisible();
  await page.getByRole('button', { name: /重置模拟数据/ }).click();
  await page.getByRole('button', { name: '保留当前数据' }).click();
  await expect(
    page.getByText('没有符合条件的记录，试试调整筛选或新建工单'),
  ).toBeVisible();
  await page.getByRole('button', { name: /重置模拟数据/ }).click();
  await page.getByRole('button', { name: '确认重置' }).click();
  await expect(page.getByText('演示应用响应变慢')).toBeVisible();
});

test('triage views clear selection and bulk assignment keeps its draft after failure', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('演示应用响应变慢')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '选择 SR-1005', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '选择 INC-1001', exact: true }).check();
  await expect(page.getByText('已选择本页 1 条工单')).toBeVisible();
  await page.getByRole('tab', { name: '活跃工单', exact: true }).click();
  await expect(page.getByText('已选择本页 1 条工单')).toBeHidden();
  await expect(page.getByRole('button', { name: '批量分派', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '查看等待分派', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  await page.getByRole('table').getByRole('checkbox').first().check();
  await expect(page.getByText('已选择本页 3 条工单')).toBeVisible();
  await page.getByRole('button', { name: '模拟下一请求失败' }).click();
  await page.getByRole('button', { name: '批量分派', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '批量分派', exact: true });
  await dialog.getByRole('button', { name: '确认批量分派' }).click();
  await expect(dialog.getByText('请选择目标处理人')).toBeVisible();
  await dialog.getByLabel('目标处理人（虚构目录）').click();
  await page.getByText('演示用户 C · 服务台', { exact: true }).click();
  await dialog.getByRole('button', { name: '确认批量分派' }).click();
  await expect(dialog.getByText('分派请求失败')).toBeVisible();
  await expect(dialog.getByText('演示用户 C · 服务台', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '确认批量分派' }).click();
  const result = page.getByRole('dialog', { name: '批量分派结果', exact: true });
  await expect(result.getByText('成功 3 条，失败 0 条')).toBeVisible();
  await expect(result.getByRole('button', { name: '返回队列' })).toBeEnabled();
  await expect(page.getByText('没有符合条件的记录，试试调整筛选或新建工单')).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-bulk-result.png`, fullPage: true });
  await result.getByRole('button', { name: '返回队列' }).click();
  await expect(page.getByText('没有符合条件的记录，试试调整筛选或新建工单')).toBeVisible();
  await page.getByRole('tab', { name: '全部工单', exact: true }).click();
  await page.getByLabel('筛选处理人').click();
  await page.getByText('演示用户 C · 服务台', { exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
  await page.getByRole('link', { name: /INC-1001/ }).click();
  await expect(page.getByText('批量分派给演示用户 C', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
