type ManagedInputBatchKind =
  | 'first'
  | 'burst'
  | 'capacity'
  | 'boundary'
  | 'ime';

export type ManagedInputBatchSample = {
  kind: ManagedInputBatchKind;
  textLength: number;
  latencyMs: number;
};

export type ManagedInputBatchCommitSample = ManagedInputBatchSample & {
  commitDurationMs: number;
};

const DEFAULT_MANAGED_INPUT_COMMIT_CADENCE_MS = 32;
const DEFAULT_MANAGED_INPUT_BATCH_LIMIT = Number.POSITIVE_INFINITY;

type ManagedInputBatchSchedulerPort = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (handle: number) => void;
  commit: (value: string, sample: ManagedInputBatchSample) => void;
};

/** Batches managed text without changing ordering-boundary semantics. */
export class ManagedInputBatchScheduler {
  readonly #port: ManagedInputBatchSchedulerPort;
  readonly #cadenceMs: number;
  readonly #maxPendingTextLength: number;
  #commitHandler: ManagedInputBatchSchedulerPort['commit'];
  #pending = '';
  #pendingSince: number | null = null;
  #frame: number | null = null;
  #timer: number | null = null;
  #lastCommitAt: number | null = null;

  constructor(
    port: ManagedInputBatchSchedulerPort,
    cadenceMs: number,
    maxPendingTextLength = DEFAULT_MANAGED_INPUT_BATCH_LIMIT
  ) {
    this.#port = port;
    this.#cadenceMs = Math.max(0, cadenceMs);
    this.#maxPendingTextLength = Number.isFinite(maxPendingTextLength)
      ? Math.max(1, Math.floor(maxPendingTextLength))
      : Number.POSITIVE_INFINITY;
    this.#commitHandler = port.commit;
  }

  setCommitHandler(handler: ManagedInputBatchSchedulerPort['commit']): void {
    this.#commitHandler = handler;
  }

  enqueue(value: string): void {
    if (!value) return;
    const now = this.#port.now();
    if (!this.#pending) this.#pendingSince = now;
    this.#pending += value;
    if (this.#pending.length >= this.#maxPendingTextLength) {
      this.flush('capacity');
      return;
    }
    if (this.#frame !== null || this.#timer !== null) return;

    const elapsed = this.#lastCommitAt === null
      ? Infinity
      : now - this.#lastCommitAt;
    if (this.#cadenceMs === 0 || elapsed >= this.#cadenceMs) {
      this.#frame = this.#port.requestFrame(() => {
        this.#frame = null;
        this.#commit('first');
      });
      return;
    }
    this.#timer = this.#port.setTimer(() => {
      this.#timer = null;
      this.#commit('burst');
    }, this.#cadenceMs - elapsed);
  }

  flush(kind: ManagedInputBatchKind = 'boundary'): void {
    this.#cancelScheduled();
    this.#commit(kind);
  }

  commitImmediate(value: string, kind: ManagedInputBatchKind = 'ime'): void {
    if (!value) return;
    this.#commitHandler(value, { kind, textLength: value.length, latencyMs: 0 });
    this.#lastCommitAt = this.#port.now();
  }

  discard(): void {
    this.#cancelScheduled();
    this.#pending = '';
    this.#pendingSince = null;
    this.#lastCommitAt = null;
  }

  #cancelScheduled(): void {
    if (this.#frame !== null) {
      this.#port.cancelFrame(this.#frame);
      this.#frame = null;
    }
    if (this.#timer !== null) {
      this.#port.clearTimer(this.#timer);
      this.#timer = null;
    }
  }

  #commit(kind: ManagedInputBatchKind): void {
    const value = this.#pending;
    if (!value) return;
    const now = this.#port.now();
    const pendingSince = this.#pendingSince ?? now;
    this.#pending = '';
    this.#pendingSince = null;
    this.#commitHandler(value, {
      kind,
      textLength: value.length,
      latencyMs: Math.max(0, now - pendingSince),
    });
    this.#lastCommitAt = now;
  }
}

export const resolveManagedInputCommitCadence = (
  search: string,
  defaultCadenceMs = DEFAULT_MANAGED_INPUT_COMMIT_CADENCE_MS
): number => {
  const params = new URLSearchParams(search);
  if (!params.has('canvas-stress')) return defaultCadenceMs;
  const requested = params.get('canvas-stress-input-commit-ms');
  if (requested === 'frame') return 0;
  const cadence = Number(requested);
  return cadence === 32 || cadence === 50 || cadence === 80
    ? cadence
    : defaultCadenceMs;
};

export const resolveManagedInputBatchLimit = (
  search: string,
  defaultLimit = DEFAULT_MANAGED_INPUT_BATCH_LIMIT
): number => {
  const params = new URLSearchParams(search);
  if (!params.has('canvas-stress')) return defaultLimit;
  const requested = params.get('canvas-stress-input-buffer-limit');
  if (requested === 'unbounded') return Number.POSITIVE_INFINITY;
  return requested === '512' ? 512 : defaultLimit;
};
