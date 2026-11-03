import type { Ticket, TicketView } from './contracts';

export type TargetState = 'pending' | 'met' | 'breached' | 'missing';
export const isActiveTicket = (ticket: Ticket) => ticket.status === 'open' || ticket.status === 'in_progress';

function targetState(actual: string | null, due: string, active: boolean, at: number): TargetState {
  if (actual) return Date.parse(actual) > Date.parse(due) ? 'breached' : 'met';
  if (!active) return 'missing';
  return at > Date.parse(due) ? 'breached' : 'pending';
}

export function assessSla(ticket: Ticket, at: number) {
  const active = isActiveTicket(ticket);
  const response = targetState(ticket.firstRespondedAt, ticket.sla.responseDueAt, active, at);
  const resolution = targetState(ticket.resolvedAt, ticket.sla.resolutionDueAt, active, at);
  return {
    response,
    resolution,
    activeBreach: active && ((!ticket.firstRespondedAt && response === 'breached') || (!ticket.resolvedAt && resolution === 'breached')),
  };
}

export function matchesView(ticket: Ticket, view: TicketView, at: number) {
  if (view === 'active') return isActiveTicket(ticket);
  if (view === 'unassigned') return isActiveTicket(ticket) && !ticket.assigneeId;
  if (view === 'sla_breached') return assessSla(ticket, at).activeBreach;
  if (view === 'resolved') return ticket.status === 'resolved' || ticket.status === 'closed';
  return true;
}
