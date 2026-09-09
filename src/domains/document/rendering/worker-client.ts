import type { TextRenderingRuntime } from "./runtime";
import type {
  CompactTextRenderResult,
  TextRenderContext,
} from "./types";

const WORKER_RENDER_THRESHOLD = 50_000;

type PendingRender = {
  resolve: (result: CompactTextRenderResult) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

const createAbortError = () => {
  const error = new Error("Text rendering was cancelled.");
  error.name = "AbortError";
  return error;
};

export class TextRenderingWorkerClient {
  readonly #runtime: TextRenderingRuntime;
  readonly #pending = new Map<number, PendingRender>();
  #worker: Worker | null = null;
  #nextId = 1;

  constructor(runtime: TextRenderingRuntime) {
    this.#runtime = runtime;
  }

  render = (
    source: string,
    defaultColor: string,
    options?: { signal?: AbortSignal } & Partial<TextRenderContext>
  ) => {
    if (options?.signal?.aborted) return Promise.reject(createAbortError());
    if (source.length < WORKER_RENDER_THRESHOLD || typeof Worker === "undefined") {
      return this.#runtime.renderCompact(source, defaultColor, {
        themeMode: options?.themeMode ?? "light",
      });
    }
    const worker = this.#getWorker();
    const id = this.#nextId++;
    const result = new Promise<CompactTextRenderResult>((resolve, reject) => {
      const abort = () => {
        const pending = this.#pending.get(id);
        if (!pending) return;
        this.#pending.delete(id);
        pending.cleanup();
        reject(createAbortError());
      };
      const cleanup = () => options?.signal?.removeEventListener("abort", abort);
      options?.signal?.addEventListener("abort", abort, { once: true });
      this.#pending.set(id, { resolve, reject, cleanup });
    });
    worker.postMessage({
      id,
      source,
      defaultColor,
      profile: this.#runtime.getProfile(),
      context: { themeMode: options?.themeMode ?? "light" },
    });
    return result;
  };

  dispose = () => {
    this.#worker?.terminate();
    this.#worker = null;
    const error = new Error("Text rendering worker was disposed.");
    this.#pending.forEach(({ reject, cleanup }) => {
      cleanup();
      reject(error);
    });
    this.#pending.clear();
  };

  #getWorker() {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<{
      id: number;
      result?: CompactTextRenderResult;
      error?: string;
    }>) => {
      const pending = this.#pending.get(event.data.id);
      if (!pending) return;
      this.#pending.delete(event.data.id);
      pending.cleanup();
      if (event.data.result) pending.resolve(event.data.result);
      else pending.reject(new Error(event.data.error ?? "Text rendering failed."));
    });
    worker.addEventListener("error", () => {
      const error = new Error("Text rendering worker failed.");
      this.#pending.forEach(({ reject, cleanup }) => {
        cleanup();
        reject(error);
      });
      this.#pending.clear();
      worker.terminate();
      if (this.#worker === worker) this.#worker = null;
    });
    this.#worker = worker;
    return worker;
  }
}
