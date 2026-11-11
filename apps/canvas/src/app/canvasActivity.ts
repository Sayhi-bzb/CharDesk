import { decodeCellPlaneOperationRows } from '@chardesk/cell-plane';
import { getTextCellWidth } from '@chardesk/protocol';
import type { CanvasRuntime } from '@/domains/canvas/public';
import { canvasActivityStore, recordCanvasActivity } from '@/shared/canvas-activity';
import { CanvasActivityStore, normalizeActivityRanges } from '@/shared/canvas-activity/model';

const agentScopes = new WeakMap<object, { depth: number }>();

/** Attribution lasts only for the synchronous command, never across persistence/render awaits. */
export function captureCanvasAgentMutation<T>(canvas: object, command: () => T): T {
  const scope = agentScopes.get(canvas);
  if (!scope) return command();
  scope.depth += 1;
  try { return command(); } finally { scope.depth -= 1; }
}

/** Host adapter: document facts invalidate activity regardless of which input produced them. */
export function connectCanvasActivity(canvas: CanvasRuntime, store: CanvasActivityStore = canvasActivityStore) {
  const scope = { depth: 0 };
  agentScopes.set(canvas, scope);
  const record = store === canvasActivityStore ? recordCanvasActivity : store.record;
  const stopMutations = canvas.documents.subscribeMutations((event, inverse) => {
    if (event.kind === 'page-delete' || event.kind === 'page-upsert') {
      record({ kind: 'clear', canvasId: event.documentId, pageId: event.kind === 'page-upsert' ? event.page.id : event.pageId });
      return;
    }
    if ((event.kind !== 'cell-plane' && event.kind !== 'anchors') || !event.operation || inverse === null) return;
    const rows = decodeCellPlaneOperationRows(event.operation);
    const effectiveRows = inverse ? decodeCellPlaneOperationRows(inverse) : rows;
    const ranges = normalizeActivityRanges(effectiveRows.flatMap((row) => [
      ...row.erase.map((interval) => ({ y: row.y, from: interval.from, to: interval.to + 1 })),
      ...row.spans.map((span) => ({ y: row.y, from: span.x, to: span.x + getTextCellWidth(span.text) })),
    ]));
    if (!ranges.length) return;
    record({ kind: 'mutation', canvasId: event.documentId, pageId: event.pageId, ranges,
      agent: scope.depth > 0, deletion: rows.every((row) => row.spans.length === 0) });
  });
  let sessions = new Set(canvas.getState().canvasSessions.map(({ id }) => id));
  const stopSessions = canvas.subscribe((state) => {
    const next = new Set(state.canvasSessions.map(({ id }) => id));
    for (const id of sessions) if (!next.has(id)) record({ kind: 'clear', canvasId: id });
    sessions = next;
  });
  return () => {
    stopMutations();
    stopSessions();
    agentScopes.delete(canvas);
  };
}
