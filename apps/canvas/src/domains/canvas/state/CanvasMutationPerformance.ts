type CanvasMutationTimingSample = {
  totalMs: number;
  mutationMs: number;
  normalizeMs: number;
  forwardEncodeMs: number;
  inverseEncodeMs: number;
  yjsPushMs: number;
  historyCaptureMs: number;
  transactionOverheadMs: number;
  notifyMs: number;
  changedCells: number;
  forwardBytes: number;
  inverseBytes: number;
};

type CanvasMutationTimingDistribution = {
  samples: number;
  median: number;
  p95: number;
  max: number;
};

type CanvasMutationPerformanceStats = {
  enabled: boolean;
  samples: number;
  stages: Record<keyof Omit<
    CanvasMutationTimingSample,
    'changedCells' | 'forwardBytes' | 'inverseBytes'
  >, CanvasMutationTimingDistribution>;
  changedCells: CanvasMutationTimingDistribution;
  forwardBytes: CanvasMutationTimingDistribution;
  inverseBytes: CanvasMutationTimingDistribution;
};

const SAMPLE_LIMIT = 512;

const summarize = (values: readonly number[]): CanvasMutationTimingDistribution => {
  if (values.length === 0) return { samples: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]!;
  return {
    samples: sorted.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1)!,
  };
};

const timingKeys = [
  'totalMs',
  'mutationMs',
  'normalizeMs',
  'forwardEncodeMs',
  'inverseEncodeMs',
  'yjsPushMs',
  'historyCaptureMs',
  'transactionOverheadMs',
  'notifyMs',
] as const;

/** Benchmark-only bounded samples for synchronous cell-plane mutations. */
export class CanvasMutationPerformance {
  #enabled = false;
  readonly #samples: CanvasMutationTimingSample[] = [];

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.reset();
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  reset(): void {
    this.#samples.length = 0;
  }

  record(sample: CanvasMutationTimingSample): void {
    if (!this.#enabled) return;
    if (this.#samples.length === SAMPLE_LIMIT) this.#samples.shift();
    this.#samples.push(sample);
  }

  getStats(): CanvasMutationPerformanceStats {
    const stages = Object.fromEntries(timingKeys.map((key) => [
      key,
      summarize(this.#samples.map((sample) => sample[key])),
    ])) as CanvasMutationPerformanceStats['stages'];
    return {
      enabled: this.#enabled,
      samples: this.#samples.length,
      stages,
      changedCells: summarize(this.#samples.map((sample) => sample.changedCells)),
      forwardBytes: summarize(this.#samples.map((sample) => sample.forwardBytes)),
      inverseBytes: summarize(this.#samples.map((sample) => sample.inverseBytes)),
    };
  }
}
