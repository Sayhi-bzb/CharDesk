import { describe, expect, it } from 'vitest';
import { CanvasMutationPerformance } from './CanvasMutationPerformance';

const sample = (totalMs: number) => ({
  totalMs,
  mutationMs: totalMs / 2,
  normalizeMs: 1,
  forwardEncodeMs: 2,
  inverseEncodeMs: 3,
  yjsPushMs: 4,
  historyCaptureMs: 5,
  transactionOverheadMs: 6,
  notifyMs: 7,
  changedCells: 8,
  forwardBytes: 9,
  inverseBytes: 10,
});

describe('CanvasMutationPerformance', () => {
  it('does not retain samples until explicitly enabled', () => {
    const performance = new CanvasMutationPerformance();
    performance.record(sample(10));
    expect(performance.getStats().samples).toBe(0);
  });

  it('reports bounded nearest-rank timing distributions', () => {
    const performance = new CanvasMutationPerformance();
    performance.setEnabled(true);
    for (let value = 1; value <= 600; value += 1) performance.record(sample(value));
    expect(performance.getStats()).toMatchObject({
      enabled: true,
      samples: 512,
      stages: {
        totalMs: { samples: 512, median: 344, p95: 575, max: 600 },
      },
    });
  });

  it('clears retained samples when disabled', () => {
    const performance = new CanvasMutationPerformance();
    performance.setEnabled(true);
    performance.record(sample(10));
    performance.setEnabled(false);
    expect(performance.getStats()).toMatchObject({ enabled: false, samples: 0 });
  });
});
