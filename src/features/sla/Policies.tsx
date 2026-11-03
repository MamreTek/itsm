import {
  Alert,
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Modal,
  Table,
  Tag,
} from 'antd';
import { useState } from 'react';
import { api, errorText } from '../../shared/api/client';
import type { SlaPolicy } from '../../shared/api/contracts';
import { LoadState, PageTitle, useResource } from '../../shared/ui';

export function Policies() {
  const resource = useResource(api.policies);
  const [editing, setEditing] = useState<SlaPolicy>();
  const [form] = Form.useForm<SlaPolicy>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { message } = App.useApp();
  async function save(values: SlaPolicy) {
    if (!editing) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.updatePolicy(editing.priority, {
        responseMinutes: values.responseMinutes,
        resolutionMinutes: values.resolutionMinutes,
        version: editing.version,
      });
      setEditing(undefined);
      resource.reload();
      message.success('策略已更新，仅影响新建工单');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="SERVICE LEVEL TARGETS"
        title="SLA 策略"
        description="从四个清晰的服务目标开始，减少复杂配置。"
        action={<Button onClick={resource.reload}>刷新策略</Button>}
      />
      <Alert
        className="policy-note"
        type="info"
        showIcon
        title="修改只对新建工单生效"
        description="按优先级匹配，创建时保存策略快照。连续自然时间计时，不含工作日历、暂停和升级通知；此处为产品原型。"
      />
      <Card title="默认优先级策略">
        <LoadState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
          empty={!resource.data?.length}
        />
        {!resource.loading && !resource.error && (
          <Table<SlaPolicy>
            rowKey="priority"
            dataSource={resource.data}
            pagination={false}
            scroll={{ x: 600 }}
            columns={[
              {
                title: '优先级',
                dataIndex: 'priority',
                render: (value) => (
                  <Tag color={value === 'P1' ? 'red' : 'blue'}>{value}</Tag>
                ),
              },
              {
                title: '首次响应',
                dataIndex: 'responseMinutes',
                render: (value) => `${value} 分钟`,
              },
              {
                title: '解决时限',
                dataIndex: 'resolutionMinutes',
                render: (value) => `${value} 分钟`,
              },
              {
                title: '版本',
                dataIndex: 'version',
                render: (value) => `v${value}`,
              },
              {
                title: '操作',
                key: 'action',
                render: (_, policy) => (
                  <Button
                    onClick={() => {
                      setEditing(policy);
                      setError(undefined);
                      form.setFieldsValue(policy);
                    }}
                  >
                    编辑 {policy.priority}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Modal
        open={!!editing}
        title={`编辑 ${editing?.priority ?? ''} 策略`}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        mask={{ closable: !busy }}
        okText="保存策略"
      >
        <p className="muted">修改不会改变已创建工单的期限。</p>
        {error && (
          <Alert
            className="form-error"
            type="error"
            title={error}
            description="版本冲突时，请取消并刷新策略再编辑。其他失败可直接重试。"
          />
        )}
        <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
          <Form.Item
            name="responseMinutes"
            label="首次响应时限（分钟）"
            rules={[
              {
                required: true,
                type: 'integer',
                min: 1,
                max: 43200,
                message: '请输入 1–43200 的整数',
              },
            ]}
          >
            <InputNumber
              min={1}
              max={43200}
              precision={0}
              className="full-width"
            />
          </Form.Item>
          <Form.Item
            name="resolutionMinutes"
            label="解决时限（分钟）"
            dependencies={['responseMinutes']}
            rules={[
              { required: true, type: 'integer', min: 1, max: 43200 },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return value >= getFieldValue('responseMinutes')
                    ? Promise.resolve()
                    : Promise.reject(new Error('解决时限不能短于响应时限'));
                },
              }),
            ]}
          >
            <InputNumber
              min={1}
              max={43200}
              precision={0}
              className="full-width"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
