import { describe, expect, it } from 'vitest';
import {
  evaluateInputSchedulingHypothesis,
  summarizeInputSchedulingSamples,
  summarizeInputSchedulingValues,
  type InputSchedulingSample,
  type InputSchedulingWorkload,
} from './canvas-input-scheduling-support';

const sample = (overrides: Partial<InputSchedulingSample> = {}): InputSchedulingSample => ({
  queueP95Ms: 50,
  queueMaxMs: 50,
  commitP95Ms: 2,
  commitMaxMs: 2,
  endToEndP95Ms: 52,
  endToEndMaxMs: 52,
  batchTextLengthP95: 512,
  batchTextLengthMax: 512,
  batches: 5,
  firstBatches: 1,
  burstBatches: 0,
  capacityBatches: 4,
  boundaryBatches: 0,
  operationDelta: 5,
  historyActionDelta: 5,
  ...overrides,
});

const workload = (
  id: string,
  value: InputSchedulingSample
): InputSchedulingWorkload => ({
  id,
  label: id,
  policy: id.startsWith('unbounded') ? 'unbounded' : 'bounded-512',
  inputMode: 'type',
  characterSet: 'ascii',
  textLength: id.endsWith('250') ? 250 : 2_500,
  delayMs: id.includes('5ms') ? 5 : 0,
  samples: [value],
  summary: summarizeInputSchedulingSamples([value]),
});

describe('canvas input scheduling support', () => {
  it('summarizes nearest-rank distributions', () => {
    expect(summarizeInputSchedulingValues([4, 1, 3, 2])).toEqual({
      samples: 4, min: 1, median: 2, p95: 4, max: 4,
    });
  });

  it('supports H7 only when every latency and batching gate passes', () => {
    const result = evaluateInputSchedulingHypothesis([
      workload('unbounded-ascii-type-0ms-2500', sample({ queueP95Ms: 400 })),
      workload('bounded-512-ascii-type-0ms-2500', sample({ queueP95Ms: 80 })),
      workload('unbounded-ascii-type-5ms-250', sample({ queueP95Ms: 35, operationDelta: 8 })),
      workload('bounded-512-ascii-type-5ms-250', sample({ queueP95Ms: 40, operationDelta: 9 })),
    ]);

    expect(result).toMatchObject({
      supported: true,
      baselineReproduced: true,
      queueReduction: 0.8,
      pacedQueueRegressionMs: 5,
      pacedOperationRegression: 1,
    });
  });

  it('rejects H7 when the baseline is not reproduced', () => {
    const result = evaluateInputSchedulingHypothesis([
      workload('unbounded-ascii-type-0ms-2500', sample({ queueP95Ms: 100 })),
      workload('bounded-512-ascii-type-0ms-2500', sample({ queueP95Ms: 20 })),
      workload('unbounded-ascii-type-5ms-250', sample()),
      workload('bounded-512-ascii-type-5ms-250', sample()),
    ]);

    expect(result.supported).toBe(false);
    expect(result.failures).toContain('baseline queue P95 did not reproduce 200 ms');
  });
});
