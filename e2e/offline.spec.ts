import { expect, test } from '@playwright/test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('source entry explains file preview without loading blocked TSX modules', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await expect(
    page.getByRole('heading', { name: '打开 ITSM 产品原型' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'offline/index.html' }),
  ).toHaveAttribute('href', './offline/index.html');
  await page.getByRole('link', { name: 'offline/index.html' }).click();
  await expect(page.getByText('演示应用响应变慢')).toBeVisible();
  expect(errors).toEqual([]);
});

test('one copied HTML runs the complete Mock workflow offline without console or network errors', async ({
  page,
  context,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'ITSM 离线预览 '));
  const file = join(directory, 'index.html');
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  try {
    await copyFile(resolve('offline/index.html'), file);
    await context.setOffline(true);
    await page.goto(pathToFileURL(file).href);
    await expect(page.getByText('演示应用响应变慢')).toBeVisible();
    await expect(page.getByText('产品原型 / 模拟数据')).toBeVisible();
    await page.getByRole('link', { name: '服务目录', exact: true }).click();
    await page.getByRole('button', { name: '申请服务' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('工单标题').fill('离线文件演示申请');
    await dialog
      .getByLabel('需求或故障描述')
      .fill('这是在完全离线的单文件中提交的虚构演示申请。');
    await dialog.getByLabel('请求人（虚构目录）').click();
    await page.getByText('演示用户 A · 业务应用组', { exact: true }).click();
    await dialog.getByRole('button', { name: '提交工单' }).click();
    await expect(
      page.getByRole('heading', { name: '离线文件演示申请' }),
    ).toBeVisible();
    await page.getByLabel('选择处理人').click();
    await page.getByText('演示用户 B · 基础设施组', { exact: true }).click();
    await page.getByRole('button', { name: '确认分派' }).click();
    await expect(page.getByRole('button', { name: '开始处理' })).toBeEnabled();
    for (const action of ['开始处理', '解决工单', '关闭工单']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('处理说明')
        .fill(`${action}：完成离线演示验证`);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '确认并记录' })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page.getByText(`完成离线演示验证`, { exact: false }).first(),
      ).toBeVisible();
    }
    await expect(page.getByText('工单已关闭，处理记录只读')).toBeVisible();
    await page.getByRole('link', { name: /返回工单队列/ }).click();
    await expect(page.getByText('离线文件演示申请')).toBeVisible();
    await page.reload();
    await expect(page.getByText('演示应用响应变慢')).toBeVisible();
    await expect(page.getByText('离线文件演示申请')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(requests.every((url) => url.startsWith('file:'))).toBe(true);
    expect(
      requests.filter((url) => !new URL(url).pathname.endsWith('/index.html')),
    ).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
