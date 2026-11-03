import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../shared/api/client';
import {
  priorities,
  statuses,
  statusText,
  ticketTypes,
  typeText,
  ticketViews,
  viewText,
} from '../../shared/api/contracts';
import type { Ticket, TicketQuery, TicketView } from '../../shared/api/contracts';
import { isActiveTicket } from '../../shared/api/sla';
import {
  dateTime,
  LoadState,
  PageTitle,
  StatusTag,
  useResource,
} from '../../shared/ui';
import { CreateTicket } from './CreateTicket';
import { BulkAssignment } from './BulkAssignment';
import { SlaCell } from './SlaCell';

export function Queue() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<TicketQuery>({
    page: 1,
    pageSize: 10,
    sort: 'createdAt:desc',
  });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [assigning, setAssigning] = useState<Ticket[]>();
  const loader = useCallback(() => api.list(query), [query]);
  const resource = useResource(loader);
  const directory = useResource(api.directory);
  const update = (patch: TicketQuery) => {
    setSelected([]);
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  };
  const refresh = () => {
    setSelected([]);
    resource.reload();
    directory.reload();
  };
  const switchView = (view: TicketView) => update({ view, status: undefined, assigneeId: undefined, requesterId: undefined });
  const summary = resource.data?.summary;
  const metrics: { title: string; value?: number; view: TicketView }[] = [
    { title: '待处理与处理中', value: summary?.active, view: 'active' },
    { title: '等待分派', value: summary?.unassigned, view: 'unassigned' },
    { title: 'SLA 已超时', value: summary?.breached, view: 'sla_breached' },
    { title: '已解决与关闭', value: summary?.resolved, view: 'resolved' },
  ];
  const peopleOptions = directory.data?.map(person => ({ value: person.id, label: `${person.name} · ${person.team}` }));
  return (
    <>
      <PageTitle
        title="工单管理"
        description="查看、分派与处理故障事件和服务请求。"
      />
      <div className="metrics">
        {metrics.map(({ title, value, view }) => (
          <Card key={view} className={query.view === view ? 'metric-selected' : ''}>
            <button className="metric-button" aria-label={`查看${title}`} aria-pressed={query.view === view} onClick={() => switchView(view)}>
            <Statistic
              title={title}
              value={resource.loading || resource.error ? '—' : (value ?? '—')}
            />
            </button>
          </Card>
        ))}
      </div>
      <Card className="query-card">
        <Form aria-label="工单查询" layout="inline" className="filters">
          <Form.Item label="工单名称" htmlFor="ticket-search">
            <Input.Search
              id="ticket-search"
              aria-label="搜索工单"
              placeholder="请输入编号或标题"
              maxLength={120}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={(q) => update({ q })}
              allowClear
              enterButton="搜索"
            />
          </Form.Item>
          <Form.Item label="工单状态" htmlFor="ticket-status">
            <Select
              id="ticket-status"
              aria-label="筛选状态"
              placeholder="全部状态"
              value={query.status}
              allowClear
              onChange={(status) => update({ status })}
              options={statuses.map((value) => ({
                value,
                label: statusText[value],
              }))}
            />
          </Form.Item>
          <Form.Item label="优先级" htmlFor="ticket-priority">
            <Select
              id="ticket-priority"
              aria-label="筛选优先级"
              placeholder="全部优先级"
              value={query.priority}
              allowClear
              onChange={(priority) => update({ priority })}
              options={priorities.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item label="工单类型" htmlFor="ticket-type">
            <Select
              id="ticket-type"
              aria-label="筛选工单类型"
              placeholder="全部类型"
              value={query.type}
              allowClear
              onChange={(type) => update({ type })}
              options={ticketTypes.map((value) => ({
                value,
                label: typeText[value],
              }))}
            />
          </Form.Item>
          <Form.Item label="排序方式" htmlFor="ticket-sort">
            <Select
              id="ticket-sort"
              aria-label="排序"
              value={query.sort}
              onChange={(sort) => update({ sort })}
              options={[
                { value: 'createdAt:desc', label: '最新创建' },
                { value: 'createdAt:asc', label: '最早创建' },
              ]}
            />
          </Form.Item>
          <Form.Item label="处理人" htmlFor="ticket-assignee">
            <Select id="ticket-assignee" aria-label="筛选处理人" placeholder="全部处理人" value={query.assigneeId}
              allowClear disabled={directory.loading || !!directory.error} options={peopleOptions} onChange={assigneeId => update({ assigneeId })} />
          </Form.Item>
          <Form.Item label="请求人" htmlFor="ticket-requester">
            <Select id="ticket-requester" aria-label="筛选请求人" placeholder="全部请求人" value={query.requesterId}
              allowClear disabled={directory.loading || !!directory.error} options={peopleOptions} onChange={requesterId => update({ requesterId })} />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Button
              onClick={() => {
                setSearch('');
                setSelected([]);
                setQuery({ page: 1, pageSize: 10, sort: 'createdAt:desc' });
              }}
            >
              重置筛选
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card
        className="queue-card"
        title="工单列表"
        extra={
          <Space role="toolbar" aria-label="工单操作">
            <Button disabled={!selected.length || resource.loading || !!resource.error || directory.loading || !!directory.error}
              onClick={() => setAssigning(resource.data?.items.filter(ticket => selected.includes(ticket.id)))}>
              批量分派
            </Button>
            <Button
              aria-label="刷新"
              icon={<ReloadOutlined aria-hidden />}
              onClick={refresh}
              loading={resource.loading}
            >
              刷新
            </Button>
            <Button
              aria-label="新建工单"
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setCreating(true)}
            >
              新建工单
            </Button>
          </Space>
        }
      >
        <Tabs id="ticket-queue-views" activeKey={query.view ?? 'all'} onChange={view => switchView(view as TicketView)}
          items={ticketViews.map(view => ({ key: view, label: viewText[view] }))} />
        {!!selected.length && <Alert className="selection-notice" type="info" showIcon
          title={`已选择本页 ${selected.length} 条工单`}
          description="切换视图、筛选、分页或刷新后会清空选择。"
          action={<Button type="link" onClick={() => setSelected([])}>清空选择</Button>} />}
        {directory.error && (
          <LoadState
            loading={false}
            error={directory.error}
            retry={directory.reload}
          />
        )}
        <LoadState
          loading={resource.loading}
          error={resource.error}
          retry={refresh}
          empty={!resource.data?.total}
        />
        {!resource.loading && !resource.error && !!resource.data?.total && (
          <Table
            rowKey="id"
            size="middle"
            dataSource={resource.data.items}
            scroll={{ x: 1215 }}
            rowSelection={{ selectedRowKeys: selected, onChange: keys => setSelected(keys),
              getCheckboxProps: ticket => ({ disabled: !isActiveTicket(ticket), 'aria-label': `选择 ${ticket.number}` }) }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: resource.data.total,
              showSizeChanger: { id: 'ticket-page-size', 'aria-label': '每页条数' },
              pageSizeOptions: [5, 10, 20],
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page, pageSize) => {
                setSelected([]);
                setQuery((q) => ({ ...q, page: pageSize === q.pageSize ? page : 1, pageSize }));
              },
            }}
            columns={[
              {
                title: '工单',
                key: 'ticket',
                width: 310,
                render: (_, t) => (
                  <Link className="ticket-link" to={`/tickets/${t.id}`}>
                    <span className="ticket-number">{t.number}</span>
                    <strong>{t.title}</strong>
                  </Link>
                ),
              },
              {
                title: '类型 / 优先级',
                key: 'type',
                width: 155,
                render: (_, t) => (
                  <Space size={8}>
                    <span>{typeText[t.type as keyof typeof typeText]}</span>
                    <Tag color={t.priority === 'P1' ? 'red' : 'default'}>
                      {t.priority}
                    </Tag>
                  </Space>
                ),
              },
              {
                title: '状态',
                key: 'status',
                width: 115,
                render: (_, t) => <StatusTag status={t.status} />,
              },
              {
                title: '处理人',
                key: 'owner',
                width: 130,
                render: (_, t) =>
                  directory.data?.find((p) => p.id === t.assigneeId)?.name ??
                  (t.assigneeId ? '目录加载中' : '未分派'),
              },
              {
                title: '请求人',
                key: 'requester',
                width: 130,
                render: (_, t) => directory.data?.find(person => person.id === t.requesterId)?.name ?? '目录加载中',
              },
              {
                title: 'SLA 目标（UTC）',
                key: 'sla',
                width: 210,
                render: (_, t) => <SlaCell ticket={t} at={resource.data!.evaluatedAt} />,
              },
              {
                title: '创建时间（UTC）',
                dataIndex: 'createdAt',
                width: 165,
                render: dateTime,
              },
            ]}
          />
        )}
      </Card>
      <p className="muted footnote">
        统计基于全部模拟工单，与队列筛选无关。超时视图只包含尚未履约的活跃工单目标。SLA 评估于 {dateTime(resource.data?.evaluatedAt ?? null)} UTC，刷新队列可重新评估。刷新浏览器后数据重置。
      </p>
      {creating && (
        <CreateTicket
          onClose={() => setCreating(false)}
          onCreated={(ticket) => {
            setCreating(false);
            navigate(`/tickets/${ticket.id}`);
          }}
        />
      )}
      {assigning && <BulkAssignment tickets={assigning} people={directory.data ?? []} onClose={() => setAssigning(undefined)} onSettled={refresh} />}
    </>
  );
}
