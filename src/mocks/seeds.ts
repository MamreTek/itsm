import type {
  CreateTicket,
  Person,
  Service,
  SlaPolicy,
} from '../shared/api/contracts';

// Entirely fictional. No source data from customers or private repositories.
export const people: Person[] = [
  { id: 'person-demo-1', name: '演示用户 A', team: '业务应用组' },
  { id: 'person-demo-2', name: '演示用户 B', team: '基础设施组' },
  { id: 'person-demo-3', name: '演示用户 C', team: '服务台' },
];
export const services: Service[] = [
  {
    id: 'svc-workspace',
    name: '开发环境申请',
    category: '基础设施',
    description: '提交用途与容量需求，由服务台跟进交付。',
    template: '使用用途：\n资源需求：\n期望完成时间：',
    priority: 'P3',
  },
  {
    id: 'svc-certificate',
    name: '证书协助',
    category: '安全服务',
    description: '登记证书问题与处理需求，本原型不签发证书。',
    template: '演示域名：app.example.com\n当前问题：\n影响范围：',
    priority: 'P2',
  },
  {
    id: 'svc-support',
    name: '应用支持',
    category: '业务应用',
    description: '反馈应用使用问题，记录影响与排查结果。',
    template: '应用名称：\n问题描述：\n发生时间：',
    priority: 'P3',
  },
];
export const policies: SlaPolicy[] = [
  { priority: 'P1', responseMinutes: 15, resolutionMinutes: 240, version: 1 },
  { priority: 'P2', responseMinutes: 60, resolutionMinutes: 480, version: 1 },
  { priority: 'P3', responseMinutes: 240, resolutionMinutes: 1440, version: 1 },
  { priority: 'P4', responseMinutes: 480, resolutionMinutes: 2880, version: 1 },
];
export const seedInputs: CreateTicket[] = [
  {
    title: '演示应用响应变慢',
    description: '演示结算应用出现响应变慢，需要排查资源与连接情况。',
    type: 'incident',
    priority: 'P1',
    requesterId: 'person-demo-1',
  },
  {
    title: '测试环境磁盘容量告警',
    description: '演示测试环境存储容量接近阈值，请评估清理或扩容。',
    type: 'incident',
    priority: 'P2',
    requesterId: 'person-demo-2',
  },
  {
    title: '申请开发联调环境',
    description: '需要一个演示联调环境，用于团队验证新版本业务流程。',
    type: 'service_request',
    priority: 'P3',
    requesterId: 'person-demo-1',
    serviceId: 'svc-workspace',
  },
  {
    title: '演示证书续期协助',
    description: '请协助检查 app.example.com 的演示证书到期情况。',
    type: 'service_request',
    priority: 'P2',
    requesterId: 'person-demo-3',
    serviceId: 'svc-certificate',
  },
  {
    title: '应用使用问题咨询',
    description: '演示用户需要了解应用导出报表的操作与限制。',
    type: 'service_request',
    priority: 'P4',
    requesterId: 'person-demo-2',
    serviceId: 'svc-support',
  },
];
