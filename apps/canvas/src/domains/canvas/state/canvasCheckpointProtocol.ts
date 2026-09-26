import type { CanvasMutationEnvelope } from "./canvasMutationEnvelope";

export type CanvasCheckpointTailEntry = {
  revision: number;
  envelopes: readonly CanvasMutationEnvelope[];
};

export type CanvasCheckpointWorkerRequest =
  | {
      type: "build";
      requestId: number;
      taskId: number;
      documentId: string;
      databaseName: string;
      generation: number;
      baseRevision: number;
      snapshot: ArrayBuffer;
    }
  | {
      type: "append-tail";
      requestId: number;
      taskId: number;
      entries: readonly CanvasCheckpointTailEntry[];
    }
  | {
      type: "finalize";
      requestId: number;
      taskId: number;
    }
  | {
      type: "abort";
      requestId: number;
      taskId: number;
      databaseName?: string;
    }
  | { type: "dispose"; requestId: number };

export type CanvasCheckpointFinalized = {
  update: Uint8Array;
  digest: string;
  baseRevision: number;
  snapshotBytes: number;
  compactedBytes: number;
  workerDurationMs: number;
};

export type CanvasCheckpointWorkerResponse =
  | { type: "ok"; requestId: number; taskId?: number; baseRevision?: number }
  | ({ type: "finalized"; requestId: number; taskId: number } & CanvasCheckpointFinalized)
  | { type: "error"; requestId: number; taskId?: number; error: string };
