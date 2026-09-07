import { describe, expect, it } from 'vitest';
import { CanvasRenderExperience } from './CanvasRenderExperience';

describe('CanvasRenderExperience', () => {
  it('tracks exact frames, glyphs, latency, and long renders', () => {
    let now = 0;
    const experience = new CanvasRenderExperience(() => now);

    experience.recordViewportActivity();
    now = 12;
    experience.recordDirectFrame(240, 8);
    experience.markSettling('viewport-interaction');
    now = 55;
    experience.recordDirectFrame(180, 40);

    expect(experience.getStats()).toEqual({
      viewportActivities: 1,
      directFrames: 2,
      directGlyphs: 180,
      totalDirectGlyphs: 420,
      fullContentFrames: 2,
      partialContentFrames: 0,
      totalDirtyCellArea: 0,
      lastFrameDurationMs: 40,
      maxFrameDurationMs: 40,
      p95FrameDurationMs: 40,
      longFrames: 1,
      lastInputPaintMs: 12,
      lastSettleLatencyMs: 43,
      managedInputBatches: 0,
      managedInputTextLength: 0,
      firstManagedInputBatches: 0,
      burstManagedInputBatches: 0,
      capacityManagedInputBatches: 0,
      boundaryManagedInputBatches: 0,
      imeManagedInputBatches: 0,
      firstManagedInputCommitP95Ms: 0,
      burstManagedInputCommitP95Ms: 0,
      burstManagedInputCommitMaxMs: 0,
      managedInputCommitP95Ms: 0,
      managedInputCommitMaxMs: 0,
      managedInputQueueP95Ms: 0,
      managedInputQueueMaxMs: 0,
      managedInputEndToEndP95Ms: 0,
      managedInputEndToEndMaxMs: 0,
      managedInputBatchTextLengthP95: 0,
      managedInputBatchTextLengthMax: 0,
    });
  });

  it('separates full and partial content frames', () => {
    const experience = new CanvasRenderExperience();

    experience.recordDirectFrame(100, 4, { kind: 'full' });
    experience.recordDirectFrame(3, 1, { kind: 'partial', dirtyCellArea: 5 });

    expect(experience.getStats()).toMatchObject({
      directFrames: 2,
      totalDirectGlyphs: 103,
      fullContentFrames: 1,
      partialContentFrames: 1,
      totalDirtyCellArea: 5,
    });
  });

  it('ignores non-viewport settling transitions', () => {
    let now = 0;
    const experience = new CanvasRenderExperience(() => now);

    experience.markSettling('content-interaction');
    now = 20;
    experience.recordDirectFrame(1, 2);

    expect(experience.getStats().lastSettleLatencyMs).toBeNull();
  });

  it('bounds frame samples while reporting nearest-rank p95', () => {
    const experience = new CanvasRenderExperience();
    for (let duration = 1; duration <= 600; duration += 1) {
      experience.recordDirectFrame(1, duration);
    }

    expect(experience.getStats().p95FrameDurationMs).toBe(575);
  });

  it('tracks managed input batching and first/burst latency separately', () => {
    const experience = new CanvasRenderExperience();
    experience.recordManagedInputBatch({ kind: 'first', textLength: 2, latencyMs: 12, commitDurationMs: 4 });
    experience.recordManagedInputBatch({ kind: 'burst', textLength: 4, latencyMs: 48, commitDurationMs: 8 });
    experience.recordManagedInputBatch({ kind: 'burst', textLength: 3, latencyMs: 52, commitDurationMs: 6 });
    experience.recordManagedInputBatch({ kind: 'boundary', textLength: 1, latencyMs: 2, commitDurationMs: 2 });
    experience.recordManagedInputBatch({ kind: 'capacity', textLength: 512, latencyMs: 20, commitDurationMs: 5 });

    expect(experience.getStats()).toMatchObject({
      managedInputBatches: 5,
      managedInputTextLength: 522,
      firstManagedInputBatches: 1,
      burstManagedInputBatches: 2,
      capacityManagedInputBatches: 1,
      boundaryManagedInputBatches: 1,
      imeManagedInputBatches: 0,
      firstManagedInputCommitP95Ms: 12,
      burstManagedInputCommitP95Ms: 52,
      burstManagedInputCommitMaxMs: 52,
      managedInputCommitP95Ms: 8,
      managedInputCommitMaxMs: 8,
      managedInputQueueP95Ms: 52,
      managedInputQueueMaxMs: 52,
      managedInputEndToEndP95Ms: 58,
      managedInputEndToEndMaxMs: 58,
      managedInputBatchTextLengthP95: 512,
      managedInputBatchTextLengthMax: 512,
    });
  });

  it('resets managed input measurements without resetting render measurements', () => {
    const experience = new CanvasRenderExperience();
    experience.recordDirectFrame(10, 4);
    experience.recordManagedInputBatch({
      kind: 'capacity', textLength: 512, latencyMs: 20, commitDurationMs: 5,
    });

    experience.resetManagedInputStats();

    expect(experience.getStats()).toMatchObject({
      directFrames: 1,
      managedInputBatches: 0,
      managedInputTextLength: 0,
      capacityManagedInputBatches: 0,
      managedInputQueueP95Ms: 0,
      managedInputCommitP95Ms: 0,
      managedInputEndToEndP95Ms: 0,
      managedInputBatchTextLengthMax: 0,
    });
  });
});
