import {
  gridChangesToCellPlaneOperation,
  decodeCellPlaneOperationRows,
  type GridCell,
} from '@chardesk/cell-plane';
import { TerminalCanvas } from './model.ts';
import type { LocalCanvasHost, LocalCodeDraft } from './host.ts';
import type { LocalRequestContext } from './request.ts';
import type { LocalSessions } from './sessions.ts';
import { contentFailure } from './request.ts';
import { randomUUID } from 'node:crypto';

export async function runCodeTransaction(
  host: LocalCanvasHost,
  sessions: LocalSessions,
  persistentHistory: boolean,
  input: Record<string, unknown>,
  context: LocalRequestContext | undefined,
  executeDraft: (host: LocalCanvasHost, draft: LocalCodeDraft) => Promise<unknown>
) {
  const file =
    input.canvasId === undefined
      ? host.active
      : host.files.find((file) => sessions.forFile(file)?.id === input.canvasId);
  if (!file?.address) return { ok: false, code: 'canvas_not_found', message: 'Canvas not found.' };
  const live = host.model.documents;
  let fork: ReturnType<typeof live.forkContentDocument> | undefined;
  let model: TerminalCanvas | undefined;
  let snapshot: ReturnType<typeof live.captureContentAt> | undefined;
  try {
    if (file.ready) await file.ready;
    if (!host.files.includes(file))
      return { ok: false, code: 'canvas_not_found', message: 'Canvas is no longer open.' };
    const address = { ...file.address };
    const baseVersion = context?.baseVersion ?? live.getContentVersion(address.documentId);
    context?.signal?.throwIfAborted();
    live.assertContentVersion(address.documentId, baseVersion);
    fork = live.forkContentDocument(address.documentId);
    snapshot = fork.documents.captureContentAt(address);
    model = new TerminalCanvas('', { documents: fork.documents, address });
    const draft = { undo: [] as string[] };
    const result = await executeDraft(
      {
        model,
        active: file,
        files: [file],
        saveFile: async () => {},
      },
      draft
    );
    if (!result || typeof result !== 'object' || ('ok' in result && result.ok === false))
      return result;
    if (input.mode !== 'apply') return { ...result, version: baseVersion };
    context?.signal?.throwIfAborted();
    if (!host.files.includes(file)) throw new Error('Canvas is no longer open.');
    file.writeGuard?.();
    live.assertContentVersion(address.documentId, baseVersion);
    let receipt;
    if (draft.undo.length) {
      for (const operationId of draft.undo)
        if (!live.undoOperation(operationId, address.documentId, address.pageId))
          throw new Error('The operation is no longer undoable.');
      receipt = { changed: true, version: live.getContentVersion(address.documentId) };
    } else {
      const before = snapshot.reader.materialize();
      const after = fork.documents
        .getContentReader(address.documentId, address.pageId)!
        .materialize();
      const changes = new Map<string, { before?: GridCell; after?: GridCell }>();
      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const previous = before.get(key),
          next = after.get(key);
        if (JSON.stringify(previous) !== JSON.stringify(next))
          changes.set(key, { before: previous, after: next });
      }
      const operation = gridChangesToCellPlaneOperation('prepared-code', changes);
      const operationId = persistentHistory ? `op-${randomUUID()}` : undefined;
      receipt = live.commitContentPatchAt(
        address,
        {
          rows: operation ? decodeCellPlaneOperationRows(operation) : [],
        },
        { baseVersion, operationId }
      );
    }
    const mutation = { ...result, operationId: undefined, ...receipt };
    try {
      await host.saveFile(file);
      return { ...mutation, persistence: 'saved', persistedVersion: file.persistedVersion };
    } catch (error) {
      return { ...mutation, persistence: 'failed', persistenceError: String(error) };
    }
  } catch (error) {
    return contentFailure(error);
  } finally {
    snapshot?.dispose();
    model?.dispose();
    fork?.documents.dispose();
  }
}
