import { Tag, Tooltip } from 'antd';
import type { Ticket } from '../../shared/api/contracts';
import { assessSla, isActiveTicket } from '../../shared/api/sla';
import { dateTime } from '../../shared/ui';

export function SlaCell({ ticket, at }: { ticket: Ticket; at: string }) {
  const state = assessSla(ticket, Date.parse(at));
  const active = isActiveTicket(ticket);
  const historical = state.response === 'breached' || state.resolution === 'breached';
  const next = !ticket.firstRespondedAt && active ? ['响应', ticket.sla.responseDueAt] : ['解决', ticket.sla.resolutionDueAt];
  return <Tooltip title={<>
    <div>响应截止：{dateTime(ticket.sla.responseDueAt)}</div>
    <div>首次响应：{dateTime(ticket.firstRespondedAt)}</div>
    <div>解决截止：{dateTime(ticket.sla.resolutionDueAt)}</div>
    <div>实际解决：{dateTime(ticket.resolvedAt)}</div>
  </>}>
    <div className="sla-cell">
      <Tag color={state.activeBreach ? 'red' : historical ? 'gold' : active ? 'blue' : 'green'}>
        {state.activeBreach ? '待履约目标超时' : historical ? '有历史超时' : active ? '时限内' : '已完成'}
      </Tag>
      <span className="muted">{active ? `${next[0]}截止 ${dateTime(next[1])}` : `解决于 ${dateTime(ticket.resolvedAt)}`}</span>
    </div>
  </Tooltip>;
}
