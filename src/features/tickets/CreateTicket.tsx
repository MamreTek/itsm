import { Alert, Form, Input, Modal, Select, Tag } from 'antd';
import { useState } from 'react';
import { api, ApiError, errorText } from '../../shared/api/client';
import type {
  CreateTicket as InputTicket,
  Service,
  Ticket,
} from '../../shared/api/contracts';
import { priorities, ticketTypes, typeText } from '../../shared/api/contracts';
import { LoadState, useResource } from '../../shared/ui';

export function CreateTicket({
  service,
  onClose,
  onCreated,
}: {
  service?: Service;
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const [form] = Form.useForm<InputTicket>();
  const people = useResource(api.directory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(values: InputTicket) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const ticket = await api.create({
        ...values,
        serviceId: service?.id ?? null,
      });
      onCreated(ticket);
    } catch (cause) {
      setError(errorText(cause));
      if (cause instanceof ApiError && cause.fields) {
        const fields = [
          'title',
          'description',
          'type',
          'priority',
          'requesterId',
          'serviceId',
        ] as const;
        form.setFields(
          fields
            .filter((name) => cause.fields?.[name])
            .map((name) => ({ name, errors: [cause.fields![name]] })),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={service ? `申请服务 · ${service.name}` : '新建工单'}
      onCancel={onClose}
      mask={{ closable: !busy }}
      closable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onOk={() => form.submit()}
      okText="提交工单"
      confirmLoading={busy}
      okButtonProps={{
        'aria-label': '提交工单',
        disabled: busy || people.loading || !!people.error,
      }}
    >
      <p className="muted">仅生成模拟工单，不会创建资源或发出通知。</p>
      {error && (
        <Alert className="form-error" type="error" showIcon title={error} />
      )}
      <LoadState
        loading={people.loading}
        error={people.error}
        retry={people.reload}
      />
      {service && (
        <Tag color="cyan">
          {service.category} / {service.name}
        </Tag>
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        disabled={busy}
        initialValues={{
          type: service ? 'service_request' : 'incident',
          priority: service?.priority ?? 'P3',
          title: service ? `${service.name}申请` : '',
          description: service?.template ?? '',
          requesterId: undefined,
        }}
      >
        <Form.Item
          name="title"
          label="工单标题"
          rules={[
            {
              required: true,
              min: 4,
              max: 120,
              whitespace: true,
              message: '请输入 4–120 个字符的标题',
            },
          ]}
        >
          <Input maxLength={120} placeholder="用一句话描述需要什么帮助" />
        </Form.Item>
        <div className="form-grid">
          <Form.Item name="type" label="工单类型" rules={[{ required: true }]}>
            <Select
              disabled={!!service}
              options={ticketTypes.map((value) => ({
                value,
                label: typeText[value],
              }))}
            />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级"
            rules={[{ required: true }]}
          >
            <Select
              options={priorities.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="requesterId"
          label="请求人（虚构目录）"
          rules={[{ required: true, message: '请选择演示请求人' }]}
        >
          <Select
            placeholder="选择请求人"
            options={people.data?.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.team}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="需求或故障描述"
          rules={[
            {
              required: true,
              min: 10,
              max: 2000,
              whitespace: true,
              message: '请输入 10–2000 个字符的描述',
            },
          ]}
        >
          <Input.TextArea
            rows={5}
            showCount
            maxLength={2000}
            placeholder="说明问题、影响范围与期望结果；请勿填写真实敏感信息"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
