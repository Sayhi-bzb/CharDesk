import { isSourceBackedCanvasSession, type CanvasSessionDescriptor } from '@/domains/sessions/public';
import type { BlackboardWorkspace } from '@/domains/legacy-blackboard/public';

export type WorkKind = 'canvas' | 'slides' | 'retired';
export type WorkItem = { id: string; name: string; kind: WorkKind; shared: boolean; sessionId?: string; sourceBackupId?: string; cloudSourceBackupId?: string };

export const collectLocalWorks = (
  sessions: readonly CanvasSessionDescriptor[],
  blackboards: readonly BlackboardWorkspace[],
): WorkItem[] => [
  ...sessions.filter((session) =>
    !isSourceBackedCanvasSession(session) && session.storagePolicy !== "ephemeral"
  ).map((session) => ({
    id: session.id,
    name: session.name,
    kind: session.mode === 'slide' ? 'slides' as const : 'canvas' as const,
    shared: Boolean(session.collaboration),
    sessionId: session.id,
  })),
  ...blackboards.map((workspace) => ({
    id: workspace.id,
    name: workspace.title,
    kind: 'retired' as const,
    shared: false,
  })),
];
