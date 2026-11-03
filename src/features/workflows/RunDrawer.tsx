import { Alert, Button, Card, Descriptions, Drawer, Form, Input, Select, Space, Tag, Timeline } from 'antd';
import { useState } from 'react';
import { api, errorText } from '../../shared/api/client';
import { priorities, ticketTypes, typeText } from '../../shared/api/contracts';
import type { Person } from '../../shared/api/contracts';
import type { RunAction, RunInputs, Workflow, WorkflowRun } from '../../shared/api/workflows';
import { dateTime } from '../../shared/ui';
import { FlowCanvas } from './FlowCanvas';

const eventText = { entered: '开始', yes: '满足条件', no: '不满足条件', waiting: '等待', approved: '模拟通过', rejected: '模拟拒绝', done: '模拟完成', completed: '结束' };
export function RunDrawer({ workflow, existing, people, onClose, onRun }: {
  workflow: Workflow;
  existing?: WorkflowRun;
  people: Person[];
  onClose: () => void;
  onRun: (run: WorkflowRun) => void;
}) {
  const [run, setRun] = useState(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [form] = Form.useForm<RunInputs>();
  const current = run?.snapshot.graph.nodes.find(node => node.id === run.currentNodeId);
  async function work(loader: () => Promise<WorkflowRun>, clearNote = false) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const value = await loader();
      setRun(value);
      onRun(value);
      if (clearNote) setNote('');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function act(action: RunAction) {
    if (!run) return;
    if (!note.trim()) { setNoteError(true); return; }
    setNoteError(false);
    void work(() => api.runAction(run.id, run.version, action, note), true);
  }
  return <Drawer title="流程模拟（Mock）" size={1000} open onClose={onClose} closable={!busy} mask={{ closable: !busy }} keyboard={!busy}>
    <Alert className="policy-note" type="info" showIcon title="仅模拟串行与条件分支，不执行真实审批或任务"
      description="运行冻结已保存版本；关闭面板或切换模块会保留本页的最近实例。刷新浏览器会清空全部模拟记录。" />
    {error && <Alert className="form-error" type="error" showIcon title="模拟请求失败" description={error} />}
    {!run ? <Form form={form} layout="vertical" initialValues={{ priority: 'P1', type: 'service_request' }} disabled={busy}
      onFinish={inputs => void work(() => api.createRun(workflow.id, workflow.version, inputs))}>
      <p>{workflow.name} · 已保存版本 v{workflow.version}</p>
      <Form.Item name="priority" label="模拟请求优先级" rules={[{ required: true }]}><Select options={priorities.map(value => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="type" label="模拟工单类型" rules={[{ required: true }]}><Select options={ticketTypes.map(value => ({ value, label: typeText[value] }))} /></Form.Item>
      <Button type="primary" htmlType="submit" loading={busy}>启动模拟</Button>
    </Form> : <>
      <Descriptions size="small" column={2} items={[
        { key: 'name', label: '冻结流程', children: `${run.snapshot.name} · v${run.snapshot.version}` },
        { key: 'status', label: '实例状态', children: <Tag color={run.status === 'completed' ? 'green' : 'blue'}>{run.status === 'completed' ? '模拟已结束' : '等待模拟操作'}</Tag> },
        { key: 'inputs', label: '冻结输入', children: `${run.inputs.priority} / ${typeText[run.inputs.type]}` },
        { key: 'version', label: '实例版本', children: `v${run.version}` },
      ]} />
      <Space wrap className="run-toolbar">
        <Button disabled={busy} onClick={() => void work(() => api.run(run.id))}>刷新实例</Button>
        <Button disabled={busy} onClick={() => { setRun(undefined); setError(undefined); setNote(''); setNoteError(false); }}>新一轮模拟</Button>
      </Space>
      {current && <Card size="small" title={`当前节点：${current.label}`} className="policy-note">
        <p>虚构负责人：{people.find(person => person.id === current.assigneeId)?.name ?? '未配置'}</p>
        <Form layout="vertical" disabled={busy}>
          <Form.Item label="模拟操作说明" validateStatus={noteError ? 'error' : undefined} help={noteError ? '请填写模拟操作说明' : undefined}>
            <Input.TextArea aria-label="模拟操作说明" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={2} />
          </Form.Item>
          <Space wrap>{current.kind === 'approval' ? <>
            <Button type="primary" loading={busy} onClick={() => act('approve')}>模拟通过</Button>
            <Button danger disabled={busy} onClick={() => act('reject')}>模拟拒绝</Button>
          </> : <Button type="primary" loading={busy} onClick={() => act('complete')}>模拟处理完成</Button>}</Space>
        </Form>
      </Card>}
      {run.status === 'completed' && <Alert className="policy-note" showIcon type={run.outcome === 'rejected' ? 'warning' : 'success'}
        title={run.outcome === 'rejected' ? '已按拒绝分支结束模拟' : '模拟流程已完成'} description="此结果只存在于浏览器内存，不改变任何真实业务工单。" />}
      <Card size="small" title="冻结流程与执行路径" className="policy-note"><FlowCanvas graph={run.snapshot.graph} run={run} selectedId={run.currentNodeId ?? run.trace.at(-1)?.nodeId} /></Card>
      <Card size="small" title="模拟执行记录">
        <Timeline items={run.trace.map(event => ({ key: event.id, color: event.outcome === 'rejected' ? 'red' : event.outcome === 'waiting' ? 'blue' : 'green',
          content: <><strong>{event.label} · {eventText[event.outcome]}</strong><div>{event.message}</div><span className="muted">{dateTime(event.at)} UTC</span></> }))} />
      </Card>
    </>}
  </Drawer>;
}
