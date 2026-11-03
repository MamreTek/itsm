import { Alert, Button, Empty, Space, Spin, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { errorText } from './api/client';
import { statusText } from './api/contracts';
import type { TicketStatus } from './api/contracts';

export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    loader()
      .then(
        (value) => {
          if (active) setData(value);
        },
        (cause) => {
          if (active) setError(errorText(cause));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loader, revision]);
  return { data, error, loading, reload };
}
export function LoadState({
  loading,
  error,
  retry,
  empty = false,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
  empty?: boolean;
}) {
  if (loading)
    return (
      <div className="load-state" role="status">
        <Spin />
        <span>正在加载模拟数据…</span>
      </div>
    );
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title="请求失败"
        description={error}
        action={<Button onClick={retry}>重试</Button>}
      />
    );
  if (empty)
    return <Empty description="没有符合条件的记录，试试调整筛选或新建工单" />;
  return null;
}
export function StatusTag({ status }: { status: TicketStatus }) {
  const colors = {
    open: 'gold',
    in_progress: 'blue',
    resolved: 'green',
    closed: 'default',
  };
  return <Tag color={colors[status]}>{statusText[status]}</Tag>;
}
export function PageTitle({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <Space wrap>
          <h1>{title}</h1>
          {meta && <span className="page-meta">{meta}</span>}
        </Space>
        <p>{description}</p>
      </div>
      {action && <Space wrap>{action}</Space>}
    </div>
  );
}
export const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(value))
    : '—';
