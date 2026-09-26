import { CanvasCheckpointExecutor } from "./CanvasCheckpointExecutor";
import type {
  CanvasCheckpointFinalized,
  CanvasCheckpointTailEntry,
  CanvasCheckpointWorkerRequest,
  CanvasCheckpointWorkerResponse,
} from "./canvasCheckpointProtocol";

type PendingRequest = {
  resolve: (response: CanvasCheckpointWorkerResponse) => void;
  reject: (error: Error) => void;
};

type RequestWithoutId<T> = T extends unknown ? Omit<T, "requestId"> : never;
type CanvasCheckpointWorkerRequestInput = RequestWithoutId<CanvasCheckpointWorkerRequest>;

export class CanvasCheckpointWorkerClient {
  readonly #fallback = typeof Worker === "undefined"
    ? new CanvasCheckpointExecutor()
    : null;
  readonly #pending = new Map<number, PendingRequest>();
  #worker: Worker | null = null;
  #requestSequence = 0;
  #taskSequence = 0;
  #disposed = false;

  async build(input: {
    documentId: string;
    databaseName: string;
    generation: number;
    baseRevision: number;
    snapshot: ArrayBuffer;
  }) {
    const taskId = ++this.#taskSequence;
    if (this.#fallback) {
      await this.#fallback.build({ ...input, taskId });
      return taskId;
    }
    await this.#request({ type: "build", taskId, ...input }, [input.snapshot]);
    return taskId;
  }

  async appendTail(taskId: number, entries: readonly CanvasCheckpointTailEntry[]) {
    if (this.#fallback) return this.#fallback.appendTail(taskId, entries);
    const response = await this.#request({ type: "append-tail", taskId, entries });
    if (response.type !== "ok" || response.baseRevision === undefined) {
      throw new Error(`Canvas checkpoint tail response is invalid: ${taskId}`);
    }
    return response.baseRevision;
  }

  async finalize(taskId: number): Promise<CanvasCheckpointFinalized> {
    if (this.#fallback) return this.#fallback.finalize(taskId);
    const response = await this.#request({ type: "finalize", taskId });
    if (response.type !== "finalized") {
      throw new Error(`Canvas checkpoint finalize response is invalid: ${taskId}`);
    }
    return {
      update: response.update,
      digest: response.digest,
      baseRevision: response.baseRevision,
      snapshotBytes: response.snapshotBytes,
      compactedBytes: response.compactedBytes,
      workerDurationMs: response.workerDurationMs,
    };
  }

  async abort(taskId: number, databaseName?: string) {
    if (this.#fallback) return this.#fallback.abort(taskId, databaseName);
    await this.#request({ type: "abort", taskId, databaseName });
  }

  async dispose() {
    if (this.#disposed) return;
    if (this.#fallback) {
      await this.#fallback.dispose();
      this.#disposed = true;
      return;
    }
    if (this.#worker) {
      await this.#request({ type: "dispose" }).catch(() => undefined);
      this.#worker.terminate();
      this.#worker = null;
    }
    this.#disposed = true;
    this.#rejectPending(new Error("Canvas checkpoint worker disposed"));
  }

  #request(
    input: CanvasCheckpointWorkerRequestInput,
    transfer: Transferable[] = []
  ) {
    if (this.#disposed) {
      return Promise.reject(new Error("Canvas checkpoint worker is disposed"));
    }
    const requestId = ++this.#requestSequence;
    const request = { ...input, requestId } as CanvasCheckpointWorkerRequest;
    const worker = this.#getWorker();
    return new Promise<CanvasCheckpointWorkerResponse>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      worker.postMessage(request, transfer);
    });
  }

  #getWorker() {
    if (this.#worker) return this.#worker;
    const worker = new Worker(
      new URL("./canvasCheckpoint.worker.ts", import.meta.url),
      { type: "module", name: "chardesk-canvas-checkpoint" }
    );
    worker.onmessage = (event: MessageEvent<CanvasCheckpointWorkerResponse>) => {
      const response = event.data;
      const pending = this.#pending.get(response.requestId);
      if (!pending) return;
      this.#pending.delete(response.requestId);
      if (response.type === "error") pending.reject(new Error(response.error));
      else pending.resolve(response);
    };
    worker.onerror = () => {
      this.#rejectPending(new Error("Canvas checkpoint worker failed"));
      worker.terminate();
      if (this.#worker === worker) this.#worker = null;
    };
    this.#worker = worker;
    return worker;
  }

  #rejectPending(error: Error) {
    this.#pending.forEach(({ reject }) => reject(error));
    this.#pending.clear();
  }
}
