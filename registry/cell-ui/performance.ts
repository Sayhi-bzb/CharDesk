export const CELL_UI_PERFORMANCE_BUDGET = Object.freeze({
  composeWidgets: 10_000,
  paintViewport: Object.freeze({ width: 120, height: 40 }),
  steadyScrollCommits: 1_000,
  steadyScrollLayoutComputes: 0,
  fullPaintP95Ms: 8,
  singleRowPaintP95Ms: 2,
  portableFullPaintCeilingMs: 80,
  portableSingleRowPaintCeilingMs: 20,
});

export const percentile = (samples: readonly number[], value: number): number => {
  if (samples.length === 0) throw new RangeError("Percentile samples must not be empty.");
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("Percentile must be between 0 and 1.");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]!;
};
