import type { CanvasRenderActivityMode } from './CanvasRenderActivity';

/** @internal */
export type CanvasRenderExperienceStats = {
  viewportActivities: number;
  directFrames: number;
  directGlyphs: number;
  totalDirectGlyphs: number;
  fullContentFrames: number;
  partialContentFrames: number;
  totalDirtyCellArea: number;
  lastFrameDurationMs: number | null;
  maxFrameDurationMs: number;
  p95FrameDurationMs: number;
  longFrames: number;
  lastInputPaintMs: number | null;
  lastSettleLatencyMs: number | null;
  managedInputBatches: number;
  managedInputTextLength: number;
  firstManagedInputBatches: number;
  burstManagedInputBatches: number;
  capacityManagedInputBatches: number;
  boundaryManagedInputBatches: number;
  imeManagedInputBatches: number;
  firstManagedInputCommitP95Ms: number;
  burstManagedInputCommitP95Ms: number;
  burstManagedInputCommitMaxMs: number;
  managedInputCommitP95Ms: number;
  managedInputCommitMaxMs: number;
  managedInputQueueP95Ms: number;
  managedInputQueueMaxMs: number;
  managedInputEndToEndP95Ms: number;
  managedInputEndToEndMaxMs: number;
  managedInputBatchTextLengthP95: number;
  managedInputBatchTextLengthMax: number;
};

const LONG_FRAME_MS = 34;
const FRAME_DURATION_SAMPLE_LIMIT = 512;
const INPUT_LATENCY_SAMPLE_LIMIT = 512;

const p95 = (samples: Float64Array, length: number) => {
  const values = Array.from(samples.subarray(0, length)).sort(
    (left, right) => left - right
  );
  return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
};

/** Tracks exact visible-region rendering without owning rendering state. */
export class CanvasRenderExperience {
  readonly #now: () => number;
  #viewportActivities = 0;
  #directFrames = 0;
  #directGlyphs = 0;
  #totalDirectGlyphs = 0;
  #fullContentFrames = 0;
  #partialContentFrames = 0;
  #totalDirtyCellArea = 0;
  #lastFrameDurationMs: number | null = null;
  #maxFrameDurationMs = 0;
  readonly #frameDurations = new Float64Array(FRAME_DURATION_SAMPLE_LIMIT);
  #frameDurationSamples = 0;
  #nextFrameDurationSample = 0;
  #longFrames = 0;
  #lastViewportActivityAt: number | null = null;
  #lastInputPaintMs: number | null = null;
  #settleStartedAt: number | null = null;
  #lastSettleLatencyMs: number | null = null;
  #managedInputBatches = 0;
  #managedInputTextLength = 0;
  #firstManagedInputBatches = 0;
  #burstManagedInputBatches = 0;
  #capacityManagedInputBatches = 0;
  #boundaryManagedInputBatches = 0;
  #imeManagedInputBatches = 0;
  readonly #firstManagedInputLatencies = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #firstManagedInputLatencySamples = 0;
  #nextFirstManagedInputLatencySample = 0;
  readonly #burstManagedInputLatencies = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #burstManagedInputLatencySamples = 0;
  #nextBurstManagedInputLatencySample = 0;
  #burstManagedInputCommitMaxMs = 0;
  readonly #managedInputCommitDurations = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #managedInputCommitDurationSamples = 0;
  #nextManagedInputCommitDurationSample = 0;
  #managedInputCommitMaxMs = 0;
  readonly #managedInputQueueLatencies = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #managedInputQueueLatencySamples = 0;
  #nextManagedInputQueueLatencySample = 0;
  #managedInputQueueMaxMs = 0;
  readonly #managedInputEndToEndLatencies = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #managedInputEndToEndLatencySamples = 0;
  #nextManagedInputEndToEndLatencySample = 0;
  #managedInputEndToEndMaxMs = 0;
  readonly #managedInputBatchTextLengths = new Float64Array(INPUT_LATENCY_SAMPLE_LIMIT);
  #managedInputBatchTextLengthSamples = 0;
  #nextManagedInputBatchTextLengthSample = 0;
  #managedInputBatchTextLengthMax = 0;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
  }

  recordViewportActivity(): void {
    this.#viewportActivities += 1;
    this.#lastViewportActivityAt = this.#now();
  }

  markSettling(previous: CanvasRenderActivityMode): void {
    if (previous !== 'viewport-interaction') return;
    this.#settleStartedAt = this.#now();
  }

  recordDirectFrame(
    glyphs: number,
    durationMs: number,
    details: { kind?: 'full' | 'partial'; dirtyCellArea?: number } = {}
  ): void {
    this.#directFrames += 1;
    this.#directGlyphs = glyphs;
    this.#totalDirectGlyphs += glyphs;
    if (details.kind === 'partial') this.#partialContentFrames += 1;
    else this.#fullContentFrames += 1;
    this.#totalDirtyCellArea += details.dirtyCellArea ?? 0;
    this.#lastFrameDurationMs = durationMs;
    this.#maxFrameDurationMs = Math.max(this.#maxFrameDurationMs, durationMs);
    this.#frameDurations[this.#nextFrameDurationSample] = durationMs;
    this.#nextFrameDurationSample =
      (this.#nextFrameDurationSample + 1) % FRAME_DURATION_SAMPLE_LIMIT;
    this.#frameDurationSamples = Math.min(
      this.#frameDurationSamples + 1,
      FRAME_DURATION_SAMPLE_LIMIT
    );
    if (durationMs > LONG_FRAME_MS) this.#longFrames += 1;

    const now = this.#now();
    if (this.#lastViewportActivityAt !== null) {
      this.#lastInputPaintMs = now - this.#lastViewportActivityAt;
      this.#lastViewportActivityAt = null;
    }
    if (this.#settleStartedAt !== null) {
      this.#lastSettleLatencyMs = now - this.#settleStartedAt;
      this.#settleStartedAt = null;
    }
  }

  recordManagedInputBatch(sample: {
    kind: 'first' | 'burst' | 'capacity' | 'boundary' | 'ime';
    textLength: number;
    latencyMs: number;
    commitDurationMs: number;
  }): void {
    this.#managedInputBatches += 1;
    this.#managedInputTextLength += sample.textLength;
    this.#managedInputQueueLatencies[this.#nextManagedInputQueueLatencySample] =
      sample.latencyMs;
    this.#nextManagedInputQueueLatencySample =
      (this.#nextManagedInputQueueLatencySample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
    this.#managedInputQueueLatencySamples = Math.min(
      this.#managedInputQueueLatencySamples + 1,
      INPUT_LATENCY_SAMPLE_LIMIT
    );
    this.#managedInputQueueMaxMs = Math.max(
      this.#managedInputQueueMaxMs,
      sample.latencyMs
    );
    const endToEndMs = sample.latencyMs + sample.commitDurationMs;
    this.#managedInputEndToEndLatencies[this.#nextManagedInputEndToEndLatencySample] =
      endToEndMs;
    this.#nextManagedInputEndToEndLatencySample =
      (this.#nextManagedInputEndToEndLatencySample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
    this.#managedInputEndToEndLatencySamples = Math.min(
      this.#managedInputEndToEndLatencySamples + 1,
      INPUT_LATENCY_SAMPLE_LIMIT
    );
    this.#managedInputEndToEndMaxMs = Math.max(
      this.#managedInputEndToEndMaxMs,
      endToEndMs
    );
    this.#managedInputBatchTextLengths[this.#nextManagedInputBatchTextLengthSample] =
      sample.textLength;
    this.#nextManagedInputBatchTextLengthSample =
      (this.#nextManagedInputBatchTextLengthSample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
    this.#managedInputBatchTextLengthSamples = Math.min(
      this.#managedInputBatchTextLengthSamples + 1,
      INPUT_LATENCY_SAMPLE_LIMIT
    );
    this.#managedInputBatchTextLengthMax = Math.max(
      this.#managedInputBatchTextLengthMax,
      sample.textLength
    );
    this.#managedInputCommitDurations[this.#nextManagedInputCommitDurationSample] =
      sample.commitDurationMs;
    this.#nextManagedInputCommitDurationSample =
      (this.#nextManagedInputCommitDurationSample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
    this.#managedInputCommitDurationSamples = Math.min(
      this.#managedInputCommitDurationSamples + 1,
      INPUT_LATENCY_SAMPLE_LIMIT
    );
    this.#managedInputCommitMaxMs = Math.max(
      this.#managedInputCommitMaxMs,
      sample.commitDurationMs
    );
    if (sample.kind === 'first') {
      this.#firstManagedInputBatches += 1;
      this.#firstManagedInputLatencies[this.#nextFirstManagedInputLatencySample] =
        sample.latencyMs;
      this.#nextFirstManagedInputLatencySample =
        (this.#nextFirstManagedInputLatencySample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
      this.#firstManagedInputLatencySamples = Math.min(
        this.#firstManagedInputLatencySamples + 1,
        INPUT_LATENCY_SAMPLE_LIMIT
      );
    } else if (sample.kind === 'burst') {
      this.#burstManagedInputBatches += 1;
      this.#burstManagedInputLatencies[this.#nextBurstManagedInputLatencySample] =
        sample.latencyMs;
      this.#nextBurstManagedInputLatencySample =
        (this.#nextBurstManagedInputLatencySample + 1) % INPUT_LATENCY_SAMPLE_LIMIT;
      this.#burstManagedInputLatencySamples = Math.min(
        this.#burstManagedInputLatencySamples + 1,
        INPUT_LATENCY_SAMPLE_LIMIT
      );
      this.#burstManagedInputCommitMaxMs = Math.max(
        this.#burstManagedInputCommitMaxMs,
        sample.latencyMs
      );
    } else if (sample.kind === 'capacity') {
      this.#capacityManagedInputBatches += 1;
    } else if (sample.kind === 'boundary') {
      this.#boundaryManagedInputBatches += 1;
    } else {
      this.#imeManagedInputBatches += 1;
    }
  }

  resetManagedInputStats(): void {
    this.#managedInputBatches = 0;
    this.#managedInputTextLength = 0;
    this.#firstManagedInputBatches = 0;
    this.#burstManagedInputBatches = 0;
    this.#capacityManagedInputBatches = 0;
    this.#boundaryManagedInputBatches = 0;
    this.#imeManagedInputBatches = 0;
    this.#firstManagedInputLatencySamples = 0;
    this.#nextFirstManagedInputLatencySample = 0;
    this.#burstManagedInputLatencySamples = 0;
    this.#nextBurstManagedInputLatencySample = 0;
    this.#burstManagedInputCommitMaxMs = 0;
    this.#managedInputCommitDurationSamples = 0;
    this.#nextManagedInputCommitDurationSample = 0;
    this.#managedInputCommitMaxMs = 0;
    this.#managedInputQueueLatencySamples = 0;
    this.#nextManagedInputQueueLatencySample = 0;
    this.#managedInputQueueMaxMs = 0;
    this.#managedInputEndToEndLatencySamples = 0;
    this.#nextManagedInputEndToEndLatencySample = 0;
    this.#managedInputEndToEndMaxMs = 0;
    this.#managedInputBatchTextLengthSamples = 0;
    this.#nextManagedInputBatchTextLengthSample = 0;
    this.#managedInputBatchTextLengthMax = 0;
  }

  getStats(): CanvasRenderExperienceStats {
    const durations = Array.from(
      this.#frameDurations.subarray(0, this.#frameDurationSamples)
    ).sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return {
      viewportActivities: this.#viewportActivities,
      directFrames: this.#directFrames,
      directGlyphs: this.#directGlyphs,
      totalDirectGlyphs: this.#totalDirectGlyphs,
      fullContentFrames: this.#fullContentFrames,
      partialContentFrames: this.#partialContentFrames,
      totalDirtyCellArea: this.#totalDirtyCellArea,
      lastFrameDurationMs: this.#lastFrameDurationMs,
      maxFrameDurationMs: this.#maxFrameDurationMs,
      p95FrameDurationMs: durations[p95Index] ?? 0,
      longFrames: this.#longFrames,
      lastInputPaintMs: this.#lastInputPaintMs,
      lastSettleLatencyMs: this.#lastSettleLatencyMs,
      managedInputBatches: this.#managedInputBatches,
      managedInputTextLength: this.#managedInputTextLength,
      firstManagedInputBatches: this.#firstManagedInputBatches,
      burstManagedInputBatches: this.#burstManagedInputBatches,
      capacityManagedInputBatches: this.#capacityManagedInputBatches,
      boundaryManagedInputBatches: this.#boundaryManagedInputBatches,
      imeManagedInputBatches: this.#imeManagedInputBatches,
      firstManagedInputCommitP95Ms: p95(
        this.#firstManagedInputLatencies,
        this.#firstManagedInputLatencySamples
      ),
      burstManagedInputCommitP95Ms: p95(
        this.#burstManagedInputLatencies,
        this.#burstManagedInputLatencySamples
      ),
      burstManagedInputCommitMaxMs: this.#burstManagedInputCommitMaxMs,
      managedInputCommitP95Ms: p95(
        this.#managedInputCommitDurations,
        this.#managedInputCommitDurationSamples
      ),
      managedInputCommitMaxMs: this.#managedInputCommitMaxMs,
      managedInputQueueP95Ms: p95(
        this.#managedInputQueueLatencies,
        this.#managedInputQueueLatencySamples
      ),
      managedInputQueueMaxMs: this.#managedInputQueueMaxMs,
      managedInputEndToEndP95Ms: p95(
        this.#managedInputEndToEndLatencies,
        this.#managedInputEndToEndLatencySamples
      ),
      managedInputEndToEndMaxMs: this.#managedInputEndToEndMaxMs,
      managedInputBatchTextLengthP95: p95(
        this.#managedInputBatchTextLengths,
        this.#managedInputBatchTextLengthSamples
      ),
      managedInputBatchTextLengthMax: this.#managedInputBatchTextLengthMax,
    };
  }
}
