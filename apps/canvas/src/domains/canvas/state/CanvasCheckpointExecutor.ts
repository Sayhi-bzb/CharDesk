import * as Y from "yjs";
import { clearDocument, IndexeddbPersistence, storeState } from "y-indexeddb";
import { applyCanvasMutationEnvelopeToDocument } from "./applyCanvasMutationEnvelope";
import {
  applyCanvasDocumentSeed,
  materializeCanvasCheckpointSource,
  readDocumentSeed,
} from "./canvasCheckpointDocument";
import { decodeCanvasCheckpointSnapshot } from "./canvasCheckpointSnapshot";
import type {
  CanvasCheckpointFinalized,
  CanvasCheckpointTailEntry,
} from "./canvasCheckpointProtocol";
import { getCanvasDocumentRoot, readCanvasPageOrder, readCanvasYPage } from "./canvasDocumentModel";

type CheckpointTask = {
  documentId: string;
  databaseName: string;
  generation: number;
  baseRevision: number;
  snapshotBytes: number;
  startedAt: number;
  doc: Y.Doc;
};

const digestSeed = async (doc: Y.Doc, id: string) => {
  const bytes = new TextEncoder().encode(JSON.stringify(readDocumentSeed(doc, id)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const assertValidDocument = (doc: Y.Doc, id: string) => {
  const root = getCanvasDocumentRoot(doc);
  if (!readCanvasPageOrder(root).some((pageId) => !!readCanvasYPage(root, pageId))) {
    throw new Error(`Canvas checkpoint has no valid pages: ${id}`);
  }
};

export class CanvasCheckpointExecutor {
  readonly #tasks = new Map<number, CheckpointTask>();

  async build(input: {
    taskId: number;
    documentId: string;
    databaseName: string;
    generation: number;
    baseRevision: number;
    snapshot: ArrayBuffer;
  }) {
    await this.abort(input.taskId, input.databaseName);
    const decoded = decodeCanvasCheckpointSnapshot(input.snapshot);
    if (decoded.documentId !== input.documentId) {
      throw new Error(`Canvas checkpoint snapshot identity mismatch: ${input.documentId}`);
    }
    const doc = new Y.Doc({ guid: input.documentId });
    applyCanvasDocumentSeed(
      doc,
      input.documentId,
      materializeCanvasCheckpointSource(decoded.source)
    );
    this.#tasks.set(input.taskId, {
      documentId: input.documentId,
      databaseName: input.databaseName,
      generation: input.generation,
      baseRevision: input.baseRevision,
      snapshotBytes: input.snapshot.byteLength,
      startedAt: performance.now(),
      doc,
    });
  }

  appendTail(taskId: number, entries: readonly CanvasCheckpointTailEntry[]) {
    const task = this.#requireTask(taskId);
    for (const entry of entries) {
      if (entry.revision <= task.baseRevision) continue;
      if (entry.revision !== task.baseRevision + 1) {
        throw new Error(
          `Canvas checkpoint tail gap: expected ${task.baseRevision + 1}, received ${entry.revision}`
        );
      }
      entry.envelopes.forEach((envelope) =>
        applyCanvasMutationEnvelopeToDocument(task.doc, envelope)
      );
      task.baseRevision = entry.revision;
    }
    return task.baseRevision;
  }

  async finalize(taskId: number): Promise<CanvasCheckpointFinalized> {
    const task = this.#requireTask(taskId);
    assertValidDocument(task.doc, task.documentId);
    const digest = await digestSeed(task.doc, task.documentId);
    await clearDocument(task.databaseName);
    const provider = new IndexeddbPersistence(task.databaseName, task.doc);
    try {
      await provider.whenSynced;
      await storeState(provider, true);
    } finally {
      await provider.destroy();
    }

    const verified = new Y.Doc({ guid: task.documentId });
    const verifier = new IndexeddbPersistence(task.databaseName, verified);
    try {
      await verifier.whenSynced;
      assertValidDocument(verified, task.documentId);
      const verifiedDigest = await digestSeed(verified, task.documentId);
      if (verifiedDigest !== digest) {
        throw new Error(`Canvas checkpoint verification failed: ${task.documentId}`);
      }
      const update = Y.encodeStateAsUpdate(verified);
      return {
        update,
        digest,
        baseRevision: task.baseRevision,
        snapshotBytes: task.snapshotBytes,
        compactedBytes: update.byteLength,
        workerDurationMs: performance.now() - task.startedAt,
      };
    } finally {
      await verifier.destroy();
      verified.destroy();
      task.doc.destroy();
      this.#tasks.delete(taskId);
    }
  }

  async abort(taskId: number, databaseName?: string) {
    const task = this.#tasks.get(taskId);
    task?.doc.destroy();
    this.#tasks.delete(taskId);
    const target = task?.databaseName ?? databaseName;
    if (target) await clearDocument(target);
  }

  async dispose() {
    await Promise.all(Array.from(this.#tasks, ([taskId, task]) =>
      this.abort(taskId, task.databaseName)
    ));
  }

  #requireTask(taskId: number) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Canvas checkpoint task is unavailable: ${taskId}`);
    return task;
  }
}
