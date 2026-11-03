import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { FlowValidation, Port, Workflow, WorkflowDraft, WorkflowRun } from '../../shared/api/workflows';

export interface WorkflowSessionState {
  saved?: Workflow;
  draft?: WorkflowDraft;
  dirty: boolean;
  selectedId: string;
  targetId?: string;
  port: Port;
  validation?: FlowValidation;
  busy: boolean;
  error?: string;
  lastRun?: WorkflowRun;
}
type SessionContext = [WorkflowSessionState, Dispatch<SetStateAction<WorkflowSessionState>>];
const WorkflowSessionContext = createContext<SessionContext | null>(null);

/** Editing state survives route changes in this page only; no browser storage or API writes. */
export function WorkflowSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WorkflowSessionState>({
    dirty: false,
    selectedId: 'start',
    port: 'next',
    busy: false,
  });
  useEffect(() => {
    if (!session.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session.dirty]);
  const value = useMemo<SessionContext>(() => [session, setSession], [session]);
  return <WorkflowSessionContext.Provider value={value}>{children}</WorkflowSessionContext.Provider>;
}

export function useWorkflowSession() {
  const value = useContext(WorkflowSessionContext);
  if (!value) throw new Error('WorkflowSessionProvider is required');
  return value;
}
