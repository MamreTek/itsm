import { Alert, Button, Form, Modal, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { api, errorText } from '../../shared/api/client';
import type { BulkAssignmentResult, Person, Ticket } from '../../shared/api/contracts';

export function BulkAssignment({ tickets, people, onClose, onSettled }: {
  tickets: Ticket[];
  people: Person[];
  onClose: () => void;
  onSettled: () => void;
}) {
  const [form] = Form.useForm<{ assigneeId: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<BulkAssignmentResult>();
  async function submit({ assigneeId }: { assigneeId: string }) {
    if (busy || result) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.bulkAssign({
        items: tickets.map(({ id, version }) => ({ id, version })),
        assigneeId,
      });
      setResult(response);
      onSettled();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return <Modal
    open
    title={result ? '批量分派结果' : '批量分派'}
    width={720}
    onCancel={onClose}
    closable={!busy}
    mask={{ closable: !busy }}
    keyboard={!busy}
    footer={result
      ? <Button aria-label="返回队列" type="primary" onClick={onClose}>返回队列</Button>
      : <><Button disabled={busy} onClick={onClose}>取消</Button><Button aria-label="确认批量分派" type="primary" loading={busy} onClick={() => form.submit()}>确认批量分派</Button></>}
  >
    {error && <Alert className="form-error" type="error" showIcon title="分派请求失败" description={error} />}
    {result ? <Alert className="form-error" showIcon type={result.failed.length ? 'warning' : 'success'}
      title={`成功 ${result.succeeded.length} 条，失败 ${result.failed.length} 条`}
      description={result.failed.length ? '失败工单没有被本次请求修改。请返回队列，检查最新状态后重新选择。' : '处理人和分派记录已更新，可返回队列查看。'} />
      : <>
        <Alert className="form-error" type="info" showIcon title={`将分派已选的 ${tickets.length} 条工单`}
          description="只处理本页所选的待处理与处理中工单；已存在的处理人将被替换。提交后逐条校验版本和状态。" />
        <Form form={form} layout="vertical" disabled={busy} onFinish={submit}>
          <Form.Item name="assigneeId" label="目标处理人（虚构目录）" rules={[{ required: true, message: '请选择目标处理人' }]}>
            <Select placeholder="请选择处理人" options={people.map(person => ({ value: person.id, label: `${person.name} · ${person.team}` }))} />
          </Form.Item>
        </Form>
      </>}
    <Table<Ticket> size="small" rowKey="id" dataSource={tickets} pagination={false} scroll={{ y: 280, x: 520 }} columns={[
      { title: '编号', dataIndex: 'number', width: 110 },
      { title: '工单标题', dataIndex: 'title', width: 220 },
      { title: result ? '执行结果' : '当前处理人', key: 'result', width: 240, render: (_, ticket) => {
        if (!result) return people.find(person => person.id === ticket.assigneeId)?.name ?? '未分派';
        const failure = result.failed.find(item => item.id === ticket.id);
        return failure ? <><Tag color="red">失败</Tag><span>{failure.message}（{failure.code}{failure.currentVersion !== undefined ? `，当前版本 ${failure.currentVersion}` : ''}）</span></> : <Tag color="green">分派成功</Tag>;
      } },
    ]} />
  </Modal>;
}
