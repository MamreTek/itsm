import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Timeline,
} from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, errorText } from '../../shared/api/client';
import type { Action, Ticket } from '../../shared/api/contracts';
import { typeText } from '../../shared/api/contracts';
import {
  dateTime,
  LoadState,
  PageTitle,
  StatusTag,
  useResource,
} from '../../shared/ui';

const actionNames: Record<Action, string> = {
  start: '开始处理',
  resolve: '解决工单',
  close: '关闭工单',
  reopen: '重新打开',
};
function SlaResult({
  due,
  actual,
  stopped,
}: {
  due: string;
  actual: string | null;
  stopped: boolean;
}) {
  const end = actual ? Date.parse(actual) : Date.now();
  const breach = end > Date.parse(due);
  return (
    <Space wrap>
      <Tag color={breach ? 'red' : 'green'}>
        {actual
          ? breach
            ? '超时完成'
            : '按时完成'
          : stopped
            ? '未记录'
            : breach
              ? '已超时'
              : '时限内'}
      </Tag>
      <span>截止 {dateTime(due)}</span>
    </Space>
  );
}
export function Detail() {
  const { id = '' } = useParams();
  const loader = useCallback(() => api.detail(id), [id]);
  const resource = useResource(loader);
  const people = useResource(api.directory);
  const { message } = App.useApp();
  const [owner, setOwner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [action, setAction] = useState<Action>();
  const [noteForm] = Form.useForm<{ note: string }>();
  const [commentForm] = Form.useForm<{ message: string }>();
  const ticket = resource.data;
  async function mutate(
    work: (ticket: Ticket) => Promise<Ticket>,
    done?: () => void,
  ) {
    if (!ticket || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await work(ticket);
      done?.();
      resource.reload();
      message.success('模拟记录已更新');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const actions: Action[] =
    ticket?.status === 'open'
      ? ['start']
      : ticket?.status === 'in_progress'
        ? ['resolve']
        : ticket?.status === 'resolved'
          ? ['close', 'reopen']
          : [];
  return (
    <>
      <Link className="back-link" to="/tickets">
        <ArrowLeftOutlined /> 返回工单队列
      </Link>
      <PageTitle
        eyebrow={ticket?.number ?? 'TICKET DETAIL'}
        title={ticket?.title ?? '工单详情'}
        description="每一步处理都记录在这里。时间使用 UTC。"
        action={
          <Button
            icon={<ReloadOutlined />}
            disabled={busy}
            onClick={() => {
              resource.reload();
              people.reload();
            }}
          >
            刷新详情
          </Button>
        }
      />
      <LoadState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
      {error && !action && (
        <Alert
          className="form-error"
          type="error"
          showIcon
          title="操作未完成"
          description={error}
          action={
            <Button onClick={resource.reload} disabled={busy}>
              刷新后重试
            </Button>
          }
        />
      )}
      {!resource.loading && !resource.error && ticket && (
        <>
          <div className="detail-grid">
            <div className="detail-main">
              <Card
                title={
                  <Space wrap>
                    <StatusTag status={ticket.status} />
                    <Tag>{typeText[ticket.type]}</Tag>
                    <Tag>{ticket.priority}</Tag>
                  </Space>
                }
                extra={<span className="muted">版本 {ticket.version}</span>}
              >
                <Descriptions
                  column={2}
                  items={[
                    {
                      key: 'requester',
                      label: '请求人',
                      children:
                        people.data?.find((p) => p.id === ticket.requesterId)
                          ?.name ?? '目录加载中',
                    },
                    {
                      key: 'owner',
                      label: '处理人',
                      children:
                        people.data?.find((p) => p.id === ticket.assigneeId)
                          ?.name ??
                        (ticket.assigneeId ? '目录加载中' : '未分派'),
                    },
                    {
                      key: 'created',
                      label: '创建时间',
                      children: dateTime(ticket.createdAt),
                    },
                    {
                      key: 'updated',
                      label: '更新时间',
                      children: dateTime(ticket.updatedAt),
                    },
                  ]}
                />
                <div className="description-block">
                  <h3>需求与影响</h3>
                  <p>{ticket.description}</p>
                </div>
                {ticket.serviceId && (
                  <p className="muted">来自服务目录 · {ticket.serviceId}</p>
                )}
                <Space wrap>
                  {actions.map((a) => (
                    <Button
                      key={a}
                      type={a === 'reopen' ? 'default' : 'primary'}
                      disabled={busy || (a === 'start' && !ticket.assigneeId)}
                      onClick={() => {
                        setAction(a);
                        setError(undefined);
                        noteForm.resetFields();
                      }}
                    >
                      {actionNames[a]}
                    </Button>
                  ))}
                </Space>
                {ticket.status === 'open' && !ticket.assigneeId && (
                  <p className="muted">先分派处理人，再开始处理。</p>
                )}
                {ticket.status === 'closed' && (
                  <Alert
                    type="success"
                    showIcon
                    title="工单已关闭，处理记录只读"
                  />
                )}
              </Card>
              <Card title="处理记录" className="activity-card">
                <Timeline
                  items={ticket.activities.map((a) => ({
                    key: a.id,
                    content: (
                      <>
                        <div className="activity-title">{a.message}</div>
                        <span className="muted">
                          {a.actor} · {dateTime(a.at)}
                        </span>
                      </>
                    ),
                  }))}
                />
                {ticket.status !== 'closed' && (
                  <Form
                    form={commentForm}
                    layout="vertical"
                    disabled={busy}
                    onFinish={({ message: note }) =>
                      void mutate(
                        (t) => api.comment(t.id, note, t.version),
                        () => commentForm.resetFields(),
                      )
                    }
                  >
                    <Form.Item
                      label="追加处理记录"
                      name="message"
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          max: 2000,
                          message: '请输入 1–2000 个字符',
                        },
                      ]}
                    >
                      <Input.TextArea
                        rows={3}
                        maxLength={2000}
                        placeholder="记录排查过程或需要补充的信息"
                      />
                    </Form.Item>
                    <Button htmlType="submit" loading={busy}>
                      添加记录
                    </Button>
                  </Form>
                )}
              </Card>
            </div>
            <aside className="detail-aside">
              {['open', 'in_progress'].includes(ticket.status) && (
                <Card title="分派处理人">
                  <LoadState
                    loading={people.loading}
                    error={people.error}
                    retry={people.reload}
                  />
                  <Select
                    className="full-width"
                    aria-label="选择处理人"
                    placeholder="选择处理人"
                    value={owner}
                    disabled={busy || people.loading || !!people.error}
                    onChange={setOwner}
                    options={people.data?.map((p) => ({
                      value: p.id,
                      label: `${p.name} · ${p.team}`,
                    }))}
                  />
                  <Button
                    className="assign-button"
                    block
                    disabled={!owner || busy || resource.loading}
                    loading={busy}
                    onClick={() =>
                      owner &&
                      void mutate(
                        (t) => api.assign(t.id, owner, t.version),
                        () => setOwner(undefined),
                      )
                    }
                  >
                    确认分派
                  </Button>
                </Card>
              )}
              <Card title="SLA 目标快照">
                <h4>首次响应 · {ticket.sla.responseMinutes} 分钟</h4>
                <SlaResult
                  due={ticket.sla.responseDueAt}
                  actual={ticket.firstRespondedAt}
                  stopped={ticket.status === 'closed'}
                />
                <h4>解决时限 · {ticket.sla.resolutionMinutes} 分钟</h4>
                <SlaResult
                  due={ticket.sla.resolutionDueAt}
                  actual={ticket.resolvedAt}
                  stopped={ticket.status === 'closed'}
                />
                <p className="muted footnote">
                  策略 v{ticket.sla.version} ·
                  创建时锁定。连续自然时间，不含工作日历和暂停。状态按最近刷新时间计算。
                </p>
              </Card>
              <Alert
                type="info"
                showIcon
                title="模拟留痕"
                description="操作人是固定演示角色，记录保存在内存中；不构成正式安全审计。"
              />
            </aside>
          </div>
        </>
      )}
      <Modal
        open={!!action}
        title={action ? actionNames[action] : ''}
        confirmLoading={busy}
        okText="确认并记录"
        cancelText="取消"
        closable={!busy}
        mask={{ closable: !busy }}
        cancelButtonProps={{ disabled: busy }}
        okButtonProps={{ disabled: resource.loading || !!resource.error }}
        onCancel={() => {
          setAction(undefined);
          setError(undefined);
        }}
        onOk={() => noteForm.submit()}
      >
        <p className="muted">
          {action === 'reopen'
            ? '重新打开后继续沿用原 SLA 期限，不会重新计时。'
            : '请说明处理结果或下一步，成功后写入工单记录。'}
        </p>
        {error && (
          <Alert
            className="form-error"
            type="error"
            title={error}
            action={
              <Button onClick={resource.reload} disabled={busy}>
                刷新详情
              </Button>
            }
          />
        )}
        <Form
          form={noteForm}
          layout="vertical"
          disabled={busy}
          onFinish={({ note }) =>
            action &&
            void mutate(
              (t) => api.transition(t.id, action, note, t.version),
              () => {
                setAction(undefined);
                noteForm.resetFields();
              },
            )
          }
        >
          <Form.Item
            name="note"
            label="处理说明"
            rules={[
              {
                required: true,
                whitespace: true,
                max: 2000,
                message: '请输入 1–2000 个字符的处理说明',
              },
            ]}
          >
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
