import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Statistic,
  Table,
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
} from '../../shared/api/contracts';
import type { TicketQuery } from '../../shared/api/contracts';
import {
  dateTime,
  LoadState,
  PageTitle,
  StatusTag,
  useResource,
} from '../../shared/ui';
import { CreateTicket } from './CreateTicket';

export function Queue() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<TicketQuery>({
    page: 1,
    pageSize: 10,
    sort: 'createdAt:desc',
  });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const loader = useCallback(() => api.list(query), [query]);
  const resource = useResource(loader);
  const directory = useResource(api.directory);
  const update = (patch: TicketQuery) =>
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  const summary = resource.data?.summary;
  return (
    <>
      <PageTitle
        eyebrow="SERVICE OPERATIONS"
        title="服务工作台"
        description="让每一次请求都有归属，每一次处理都有记录。"
        action={
          <>
            <Button
              aria-label="刷新"
              icon={<ReloadOutlined aria-hidden />}
              onClick={() => {
                resource.reload();
                directory.reload();
              }}
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
          </>
        }
      />
      <div className="metrics">
        {[
          ['待处理与处理中', summary?.active, '所有队列中的活跃工单'],
          ['等待分派', summary?.unassigned, '给请求找到合适的处理人'],
          ['SLA 已超时', summary?.breached, '活跃工单任一目标超时'],
          ['已解决与关闭', summary?.resolved, '处理结果已记录'],
        ].map(([title, value, note]) => (
          <Card key={String(title)}>
            <Statistic
              title={title}
              value={resource.loading || resource.error ? '—' : (value ?? '—')}
            />
            <p className="muted metric-note">{note}</p>
          </Card>
        ))}
      </div>
      <Card
        className="queue-card"
        title="工单队列"
        extra={<span className="muted">UTC · 连续自然时间</span>}
      >
        <div className="filters">
          <Input.Search
            aria-label="搜索工单"
            placeholder="搜索编号或标题"
            maxLength={120}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(q) => update({ q })}
            allowClear
            enterButton="搜索"
          />
          <Select
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
          <Select
            aria-label="筛选优先级"
            placeholder="全部优先级"
            value={query.priority}
            allowClear
            onChange={(priority) => update({ priority })}
            options={priorities.map((value) => ({ value, label: value }))}
          />
          <Select
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
          <Select
            aria-label="排序"
            value={query.sort}
            onChange={(sort) => update({ sort })}
            options={[
              { value: 'createdAt:desc', label: '最新创建' },
              { value: 'createdAt:asc', label: '最早创建' },
            ]}
          />
          <Button
            onClick={() => {
              setSearch('');
              setQuery({ page: 1, pageSize: 10, sort: 'createdAt:desc' });
            }}
          >
            重置筛选
          </Button>
        </div>
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
          retry={resource.reload}
          empty={!resource.data?.total}
        />
        {!resource.loading && !resource.error && !!resource.data?.total && (
          <Table
            rowKey="id"
            size="middle"
            dataSource={resource.data.items}
            scroll={{ x: 820 }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: resource.data.total,
              showSizeChanger: true,
              pageSizeOptions: [5, 10, 20],
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page, pageSize) =>
                setQuery((q) => ({ ...q, page, pageSize })),
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
                  <Space orientation="vertical" size={2}>
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
        统计基于全部模拟工单，与队列筛选无关。刷新浏览器后数据重置。
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
    </>
  );
}
