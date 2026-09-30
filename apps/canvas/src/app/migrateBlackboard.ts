import { legacyBlackboards, convertBlackboardSource, type LegacyBlackboardRepository } from "@/domains/legacy-blackboard/public";
import { parseDocumentSessionSource } from "@/domains/document/public";
import type { CanvasRuntime } from "@/domains/canvas/public";

type MigrationCanvas = Pick<CanvasRuntime, "ready" | "getState" | "commands" | "flushPersistence" | "materializeSession">;
const tasks = new WeakMap<MigrationCanvas, Map<string, Promise<string>>>();

/** Source and journal survive failure; completed native content is never regenerated. */
export const migrateBlackboard = (canvas: MigrationCanvas, workspaceId: string, repository: LegacyBlackboardRepository = legacyBlackboards): Promise<string> => {
  let pending = tasks.get(canvas);
  if (!pending) { pending = new Map(); tasks.set(canvas, pending); }
  const existing = pending.get(workspaceId);
  if (existing) return existing;
  const convert = async () => {
    await canvas.ready;
    const record = await repository.readMigration(workspaceId);
    if (record?.state === "complete") {
      if (!await canvas.materializeSession(record.sessionId)) throw new Error("Converted Canvas is unavailable; source backup is retained.");
      canvas.commands.sessions.completeMigration(record.sessionId);
      await canvas.flushPersistence(record.sessionId);
      if (!await canvas.commands.sessions.switch(record.sessionId)) throw new Error("The converted Canvas is no longer available; source backup is retained.");
      return record.sessionId;
    }
    const source = await repository.readWorkspace(workspaceId);
    if (!source) throw new Error("Legacy source not found.");
    const bound = canvas.getState().canvasSessions.find((session) => session.sourceBinding?.provider === "browser-workspace" && session.sourceBinding.id === workspaceId);
    const sessionId = record?.sessionId ?? bound?.id ?? `migrated-${workspaceId}`;
    const native = canvas.getState().canvasSessions.find((session) => session.id === sessionId && !session.sourceBinding);
    if (native && !record) throw new Error("Migration target is already occupied; nothing was overwritten.");
    await repository.saveMigration({ workspaceId, sessionId, state: "pending" });
    if (native) {
      if (!await canvas.materializeSession(sessionId)) throw new Error("Pending Canvas could not be restored; source is retained.");
    } else {
      const converted = await convertBlackboardSource(source);
      const snapshot = await parseDocumentSessionSource(converted.content, { sourceName: "converted.chardesk" });
      canvas.commands.sessions.importMigrated(sessionId, workspaceId, source.workspace.title, snapshot);
    }
    await canvas.flushPersistence(sessionId);
    await repository.saveMigration({ workspaceId, sessionId, state: "complete" });
    canvas.commands.sessions.completeMigration(sessionId);
    await canvas.flushPersistence(sessionId);
    if (!await canvas.commands.sessions.switch(sessionId)) throw new Error("Converted Canvas unavailable.");
    return sessionId;
  };
  const task = (async () => {
    if (!navigator.locks) throw new Error("Safe migration requires browser storage coordination. Original source is retained.");
    return await navigator.locks.request(`chardesk-blackboard-migration:${workspaceId}`, convert);
  })();
  pending.set(workspaceId, task);
  void task.finally(() => pending.delete(workspaceId)).catch(() => undefined);
  return task;
};
