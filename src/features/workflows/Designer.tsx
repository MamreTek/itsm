import { Alert, App, Button, Card, Form, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { api, errorText } from '../../shared/api/client';
import { createId } from '../../shared/api/id';
import { priorities, ticketTypes, typeText } from '../../shared/api/contracts';
import { nodeKinds, nodeText, portsFor, portText } from '../../shared/api/workflows';
import type { FlowNode, FlowValidation, NodeKind, Port, Workflow, WorkflowDraft, WorkflowRun } from '../../shared/api/workflows';
import { LoadState, PageTitle, useResource } from '../../shared/ui';
import { FlowCanvas } from './FlowCanvas';
import { RunDrawer } from './RunDrawer';

const draftOf = ({ name, description, graph }: Workflow): WorkflowDraft => structuredClone({ name, description, graph });
function freePosition(nodes: FlowNode[]) {
  const candidates = [{ x: 360, y: 220 }, ...Array.from({ length: 40 }, (_, index) => ({ x: (index % 5) * 220, y: Math.floor(index / 5) * 100 }))];
  return candidates.find(position => nodes.every(node => position.x + 206 <= node.x || node.x + 206 <= position.x || position.y + 80 <= node.y || node.y + 80 <= position.y)) ?? { x: 40, y: 40 };
}
export function Designer() {
  const resource = useResource(api.workflows);
  const directory = useResource(api.directory);
  const { modal, message } = App.useApp();
  const [saved, setSaved] = useState<Workflow>();
  const [draft, setDraft] = useState<WorkflowDraft>();
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState('start');
  const [targetId, setTargetId] = useState<string>();
  const [port, setPort] = useState<Port>('next');
  const [validation, setValidation] = useState<FlowValidation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showRun, setShowRun] = useState(false);
  const [resume, setResume] = useState(false);
  const [lastRun, setLastRun] = useState<WorkflowRun>();
  useEffect(() => {
    if (!saved && resource.data?.[0]) {
      setSaved(resource.data[0]);
      setDraft(draftOf(resource.data[0]));
      setValidation(resource.data[0].validation);
    }
  }, [resource.data, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const selected = draft?.graph.nodes.find(node => node.id === selectedId);
  const availablePorts = selected ? portsFor[selected.kind] : [];
  const effectivePort = availablePorts.includes(port) ? port : availablePorts[0];
  const options = draft?.graph.nodes.map(node => ({ value: node.id, label: `${node.label || '未命名'} · ${nodeText[node.kind]}` }));
  const accept = (workflow: Workflow) => {
    setSaved(workflow);
    setDraft(draftOf(workflow));
    setValidation(workflow.validation);
    setSelectedId(workflow.graph.nodes[0]?.id ?? '');
    setTargetId(undefined);
    setDirty(false);
    resource.reload();
  };
  const edit = (value: WorkflowDraft) => { setDraft(value); setDirty(true); setValidation(undefined); };
  const editNode = (patch: Partial<FlowNode>) => {
    if (draft && selected) edit({ ...draft, graph: { ...draft.graph, nodes: draft.graph.nodes.map(node => node.id === selected.id ? { ...node, ...patch } : node) } });
  };
  async function work(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try { await action(); } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  const discardThen = (action: () => void) => dirty
    ? modal.confirm({ title: '放弃未保存的流程改动？', content: '当前改动尚未保存，切换后将丢失。已保存版本和已开始的模拟不受影响。', okText: '放弃改动', cancelText: '继续编辑', onOk: action })
    : action();
  const load = (id: string) => discardThen(() => void work(async () => accept(await api.workflow(id))));
  const create = () => discardThen(() => void work(async () => {
    accept(await api.createWorkflow({ name: '新建流程', description: '', graph: {
      nodes: [{ id: createId(), kind: 'start', label: '开始', x: 360, y: 80 }, { id: createId(), kind: 'end', label: '结束', x: 360, y: 360 }], edges: [],
    } }));
    message.success('新草稿已创建，请添加连线后校验');
  }));
  const addNode = (kind: NodeKind) => {
    if (!draft || draft.graph.nodes.length >= 30) return;
    const node: FlowNode = { id: createId(), kind, label: `新${nodeText[kind]}`, ...freePosition(draft.graph.nodes),
      ...(kind === 'condition' ? { condition: { field: 'priority', value: 'P1' } as const } : {}) };
    edit({ ...draft, graph: { ...draft.graph, nodes: [...draft.graph.nodes, node] } });
    setSelectedId(node.id);
  };
  const removeNode = () => {
    if (!draft || !selected) return;
    modal.confirm({ title: `删除节点“${selected.label || '未命名'}”？`, content: '同时移除此节点的全部入边和出边。保存后该草稿可能需要重新连线才能运行。', okText: '删除节点', cancelText: '保留节点', okButtonProps: { danger: true },
      onOk: () => {
        edit({ ...draft, graph: { nodes: draft.graph.nodes.filter(node => node.id !== selected.id), edges: draft.graph.edges.filter(edge => edge.source !== selected.id && edge.target !== selected.id) } });
        setSelectedId('');
      } });
  };
  const addEdge = () => {
    if (!draft || !selected || !targetId || !effectivePort) return;
    if (draft.graph.edges.some(edge => edge.source === selected.id && edge.port === effectivePort)) {
      message.warning('这个出口已有连线，请先删除旧连线');
      return;
    }
    edit({ ...draft, graph: { ...draft.graph, edges: [...draft.graph.edges, { id: createId(), source: selected.id, target: targetId, port: effectivePort }] } });
    setTargetId(undefined);
  };
  return <>
    <PageTitle title="流程中心" description="设计串行与条件分支流程，保存草稿后使用虚构请求逐步模拟。" />
    <LoadState loading={resource.loading && !saved} error={resource.error} retry={resource.reload} />
    <LoadState loading={directory.loading} error={directory.error} retry={directory.reload} />
    {error && <Alert className="form-error" type="error" showIcon title="流程请求失败" description={error} />}
    {draft && saved && <>
      <Card className="policy-note" title="流程设计器" extra={<Tag color={dirty ? 'gold' : saved.validation.valid ? 'green' : 'orange'}>{dirty ? '有未保存改动' : saved.validation.valid ? `已保存 v${saved.version} · 可模拟` : `已保存 v${saved.version} · 草稿待修复`}</Tag>}>
        <Space wrap className="workflow-toolbar">
          <Select aria-label="选择流程" value={saved.id} disabled={busy} onChange={load} style={{ minWidth: 220 }}
            options={[...(resource.data ?? []).filter(item => item.id !== saved.id), saved].map(item => ({ value: item.id, label: item.name || '未命名流程' }))} />
          <Button icon={<PlusOutlined aria-hidden />} disabled={busy} onClick={create}>新建流程</Button>
          <Button icon={<ReloadOutlined aria-hidden />} disabled={busy} onClick={() => load(saved.id)}>读取已保存版本</Button>
          <Button disabled={busy} onClick={() => void work(async () => { setValidation(await api.validateWorkflow(draft)); })}>校验流程</Button>
          <Button type="primary" icon={<SaveOutlined aria-hidden />} loading={busy} onClick={() => void work(async () => { accept(await api.saveWorkflow(saved.id, draft, saved.version)); message.success('流程草稿已保存'); })}>保存草稿</Button>
          <Button disabled={busy || dirty || !saved.validation.valid} onClick={() => { setResume(false); setShowRun(true); }}>模拟运行</Button>
          {lastRun && <Button disabled={busy} onClick={() => { setResume(true); setShowRun(true); }}>查看上次模拟</Button>}
        </Space>
        <Form layout="vertical" disabled={busy} className="workflow-meta">
          <Form.Item label="流程名称" htmlFor="workflow-name"><Input id="workflow-name" value={draft.name} maxLength={80} onChange={event => edit({ ...draft, name: event.target.value })} /></Form.Item>
          <Form.Item label="流程说明" htmlFor="workflow-description"><Input id="workflow-description" value={draft.description} maxLength={1000} onChange={event => edit({ ...draft, description: event.target.value })} /></Form.Item>
        </Form>
        <p className="muted">点击节点编辑属性，拖动或聚焦后用方向键移动。草稿允许暂存不完整配置；只有通过校验的已保存版本可模拟。离开本模块前请保存。</p>
      </Card>
      {validation && <Alert className="policy-note" showIcon type={validation.valid ? 'success' : 'warning'} title={validation.valid ? '流程校验通过' : `流程存在 ${validation.issues.length} 个问题`}
        description={!validation.valid && <ul className="flow-issues">{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>
          {issue.nodeId ? <Button type="link" onClick={() => setSelectedId(issue.nodeId!)}>{draft.graph.nodes.find(node => node.id === issue.nodeId)?.label || '节点'}：{issue.message}</Button> : issue.message}
        </li>)}</ul>} />}
      <div className="designer-grid">
        <Card title="流程画布" extra={<span className="muted">{draft.graph.nodes.length}/30 节点 · {draft.graph.edges.length}/80 连线</span>}>
          <Space wrap className="node-palette">{nodeKinds.map(kind => <Button key={kind} size="small" disabled={busy || draft.graph.nodes.length >= 30} onClick={() => addNode(kind)}>添加{nodeText[kind]}节点</Button>)}</Space>
          <FlowCanvas graph={draft.graph} selectedId={selectedId} onSelect={setSelectedId}
            onMove={busy ? undefined : (id, x, y) => edit({ ...draft, graph: { ...draft.graph, nodes: draft.graph.nodes.map(node => node.id === id ? { ...node, x, y } : node) } })} />
        </Card>
        <div className="node-properties">
          <Card title="节点属性" className="policy-note">
            {selected ? <Form layout="vertical" disabled={busy}>
              <Form.Item label="节点类型"><Tag>{nodeText[selected.kind]}</Tag></Form.Item>
              <Form.Item label="节点名称" htmlFor="flow-node-label"><Input id="flow-node-label" value={selected.label} maxLength={60} onChange={event => editNode({ label: event.target.value })} /></Form.Item>
              {['approval', 'task'].includes(selected.kind) && <Form.Item label="节点负责人（虚构目录）" htmlFor="flow-node-assignee">
                <Select id="flow-node-assignee" placeholder="请选择负责人" value={selected.assigneeId} disabled={busy || directory.loading || !!directory.error} allowClear
                  options={directory.data?.map(person => ({ value: person.id, label: `${person.name} · ${person.team}` }))} onChange={assigneeId => editNode({ assigneeId })} />
              </Form.Item>}
              {selected.kind === 'condition' && <>
                <Form.Item label="条件字段" htmlFor="flow-condition-field"><Select id="flow-condition-field" value={selected.condition?.field} options={[{ value: 'priority', label: '请求优先级' }, { value: 'type', label: '工单类型' }]}
                  onChange={field => editNode({ condition: { field, value: field === 'priority' ? 'P1' : 'incident' } })} /></Form.Item>
                <Form.Item label="等于" htmlFor="flow-condition-value"><Select<string> id="flow-condition-value" value={selected.condition?.value}
                  options={selected.condition?.field === 'type' ? ticketTypes.map(value => ({ value, label: typeText[value] })) : priorities.map(value => ({ value, label: value }))}
                  onChange={value => editNode({ condition: { field: selected.condition?.field ?? 'priority', value } })} /></Form.Item>
              </>}
              <p className="muted">位置：x {selected.x}，y {selected.y}；ID：{selected.id}</p>
              <Button danger disabled={busy} onClick={removeNode}>删除选中节点</Button>
            </Form> : <p className="muted">请点击画布中的节点。</p>}
          </Card>
          <Card title="添加连线">
            <Form layout="vertical" disabled={busy}>
              <Form.Item label="来源节点" htmlFor="flow-edge-source"><Select id="flow-edge-source" virtual={false} value={selectedId || undefined} options={options} onChange={setSelectedId} /></Form.Item>
              <Form.Item label="出口" htmlFor="flow-edge-port"><Select id="flow-edge-port" value={effectivePort} options={availablePorts.map(value => ({ value, label: portText[value] }))} onChange={setPort} /></Form.Item>
              <Form.Item label="目标节点" htmlFor="flow-edge-target"><Select id="flow-edge-target" virtual={false} value={targetId} placeholder="请选择目标节点" options={options?.filter(item => item.value !== selectedId)} onChange={setTargetId} /></Form.Item>
              <Button disabled={busy || !selected || !effectivePort || !targetId || targetId === selectedId || draft.graph.edges.length >= 80} onClick={addEdge}>添加连线</Button>
            </Form>
          </Card>
        </div>
      </div>
      <Card title="连线配置" className="connections-card">
        <Table rowKey="id" size="small" dataSource={draft.graph.edges} pagination={false} scroll={{ x: 620 }} columns={[
          { title: '来源', key: 'source', render: (_, edge) => draft.graph.nodes.find(node => node.id === edge.source)?.label ?? '节点不存在' },
          { title: '出口', dataIndex: 'port', render: (value: Port) => portText[value] },
          { title: '目标', key: 'target', render: (_, edge) => draft.graph.nodes.find(node => node.id === edge.target)?.label ?? '节点不存在' },
          { title: '操作', key: 'actions', width: 90, render: (_, edge) => <Popconfirm title="删除这条连线？" okText="删除连线" cancelText="保留连线" onConfirm={() => edit({ ...draft, graph: { ...draft.graph, edges: draft.graph.edges.filter(item => item.id !== edge.id) } })}>
            <Button type="link" danger size="small" disabled={busy} aria-label={`删除连线 ${edge.id}`}>删除</Button></Popconfirm> },
        ]} />
      </Card>
      {showRun && <RunDrawer workflow={saved} existing={resume ? lastRun : undefined} people={directory.data ?? []} onClose={() => setShowRun(false)} onRun={setLastRun} />}
    </>}
  </>;
}
