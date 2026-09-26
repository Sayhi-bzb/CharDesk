type CanvasCheckpointReason = "structs" | "operations" | "payload";

type CanvasCheckpointMetrics = {
  yjsStructs: number;
  operations: number;
  authorityPayloadBytes: number;
};

export type CanvasCheckpointDiagnostics = {
  phase:
    | "idle"
    | "encoding"
    | "materializing"
    | "replaying"
    | "persisting"
    | "reopening"
    | "verifying"
    | "committing"
    | "failed";
  generation: number;
  baseRevision: number;
  tailActions: number;
  durationMs: number;
  reclaimedBytes: number;
  snapshotBytes: number;
  workerDurationMs: number;
  retries: number;
  reason: CanvasCheckpointReason | null;
  error: string | null;
};

export type CanvasCheckpointCandidate = {
  generation: number;
  baseRevision: number;
};

type CanvasCheckpointAdapter<Candidate extends CanvasCheckpointCandidate> = {
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics: () => CanvasCheckpointMetrics;
  build: (
    generation: number,
    baseRevision: number,
    report: CanvasCheckpointReporter
  ) => Promise<Candidate>;
  catchUp?: (
    candidate: Candidate,
    currentRevision: number,
    report: CanvasCheckpointReporter
  ) => Promise<Candidate | null>;
  verify: (candidate: Candidate, report: CanvasCheckpointReporter) => Promise<void>;
  commit: (candidate: Candidate) => Promise<{ reclaimedBytes?: number }>;
  abort: (candidate: Candidate) => Promise<void>;
};

type CanvasCheckpointReporter = (
  phase: CanvasCheckpointDiagnostics["phase"],
  patch?: Partial<Pick<
    CanvasCheckpointDiagnostics,
    "snapshotBytes" | "workerDurationMs" | "tailActions"
  >>
) => void;

const STRUCT_THRESHOLD = 10_000;
const OPERATION_THRESHOLD = 5_000;
const PAYLOAD_THRESHOLD = 64 * 1024 * 1024;

export class CanvasCheckpointService<Candidate extends CanvasCheckpointCandidate> {
  readonly #adapter: CanvasCheckpointAdapter<Candidate>;
  #running: Promise<boolean> | null = null;
  #runToken = 0;
  #diagnostics: CanvasCheckpointDiagnostics;

  constructor(adapter: CanvasCheckpointAdapter<Candidate>) {
    this.#adapter = adapter;
    this.#diagnostics = {
      phase: "idle",
      generation: adapter.getGeneration(),
      baseRevision: adapter.getRevision(),
      tailActions: 0,
      durationMs: 0,
      reclaimedBytes: 0,
      snapshotBytes: 0,
      workerDurationMs: 0,
      retries: 0,
      reason: null,
      error: null,
    };
  }

  evaluate() {
    const metrics = this.#adapter.getMetrics();
    if (metrics.yjsStructs >= STRUCT_THRESHOLD) return "structs" as const;
    if (metrics.operations >= OPERATION_THRESHOLD) return "operations" as const;
    if (metrics.authorityPayloadBytes >= PAYLOAD_THRESHOLD) return "payload" as const;
    return null;
  }

  getDiagnostics = () => ({ ...this.#diagnostics });

  run = () => {
    if (this.#running) return this.#running;
    const reason = this.evaluate();
    if (!reason) return Promise.resolve(false);
    this.#running = this.#run(reason).finally(() => { this.#running = null; });
    return this.#running;
  };

  cancel = () => {
    this.#runToken += 1;
  };

  async #run(reason: CanvasCheckpointReason) {
    const runToken = ++this.#runToken;
    const assertCurrent = () => {
      if (runToken !== this.#runToken) {
        throw new CanvasCheckpointCancelledError();
      }
    };
    const startedAt = performance.now();
    let candidate: Candidate | null = null;
    const baseRevision = this.#adapter.getRevision();
    const report: CanvasCheckpointReporter = (phase, patch) => {
      this.#diagnostics = { ...this.#diagnostics, phase, ...patch };
    };
    try {
      this.#diagnostics = {
        ...this.#diagnostics,
        phase: "encoding",
        generation: this.#adapter.getGeneration() + 1,
        baseRevision,
        tailActions: 0,
        retries: 0,
        reason,
        error: null,
      };
      candidate = await this.#adapter.build(
        this.#adapter.getGeneration() + 1,
        baseRevision,
        report
      );
      assertCurrent();
      const currentRevision = this.#adapter.getRevision();
      if (currentRevision !== candidate.baseRevision) {
        this.#diagnostics.tailActions += currentRevision - candidate.baseRevision;
        report("replaying");
        const caughtUp = this.#adapter.catchUp
          ? await this.#adapter.catchUp(candidate, currentRevision, report)
          : null;
        assertCurrent();
        if (caughtUp) candidate = caughtUp;
        else {
          await this.#adapter.abort(candidate);
          candidate = null;
          this.#diagnostics.retries += 1;
          candidate = await this.#adapter.build(
            this.#adapter.getGeneration() + 1,
            currentRevision,
            report
          );
          assertCurrent();
        }
      }
      report("verifying");
      await this.#adapter.verify(candidate, report);
      assertCurrent();
      if (this.#adapter.getRevision() !== candidate.baseRevision) {
        await this.#adapter.abort(candidate);
        this.#diagnostics.phase = "idle";
        this.#diagnostics.durationMs = performance.now() - startedAt;
        return false;
      }
      this.#diagnostics.phase = "committing";
      const result = await this.#adapter.commit(candidate);
      this.#diagnostics = {
        ...this.#diagnostics,
        phase: "idle",
        generation: candidate.generation,
        baseRevision: candidate.baseRevision,
        durationMs: performance.now() - startedAt,
        reclaimedBytes: result.reclaimedBytes ?? 0,
        error: null,
      };
      return true;
    } catch (error) {
      if (candidate) await this.#adapter.abort(candidate).catch(() => undefined);
      if (error instanceof CanvasCheckpointCancelledError) {
        this.#diagnostics = {
          ...this.#diagnostics,
          phase: "idle",
          durationMs: performance.now() - startedAt,
          error: null,
        };
        return false;
      }
      this.#diagnostics = {
        ...this.#diagnostics,
        phase: "failed",
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : "Canvas checkpoint failed",
      };
      return false;
    }
  }
}

class CanvasCheckpointCancelledError extends Error {
  constructor() {
    super("Canvas checkpoint cancelled");
  }
}
