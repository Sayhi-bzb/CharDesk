import { describe, expect, it } from 'vitest';
import {
  evaluatePairedOperationHypothesis,
  summarizeInputCommitSamples,
  summarizeInputCommitValues,
  type InputCommitWorkload,
} from './canvas-input-commit-support';

describe('canvas input commit support', () => {
  it('summarizes nearest-rank distributions', () => {
    expect(summarizeInputCommitValues([4, 1, 3, 2])).toEqual({
      samples: 4, min: 1, median: 2, p95: 4, max: 4,
    });
  });

  it('rejects paired encoding when a large workload is below the share gate', () => {
    const summary = summarizeInputCommitSamples([{
      totalMs: 10,
      stages: { forwardEncodeMs: 2, inverseEncodeMs: 1 },
      changedCells: 1,
      forwardBytes: 1,
      inverseBytes: 1,
      operationDelta: 1,
      historyActionDelta: 1,
      cellDelta: 1,
    }]);
    const workload: InputCommitWorkload = {
      id: 'ascii-empty-1000', label: 'test', characterSet: 'ascii',
      target: 'empty', textLength: 1_000, samples: [], summary,
    };
    expect(evaluatePairedOperationHypothesis([workload])).toMatchObject({
      supported: false,
      encodeShareByWorkload: { 'ascii-empty-1000': 0.3 },
    });
  });

  it('summarizes dynamic mutation stages', () => {
    const summary = summarizeInputCommitSamples([{
      totalMs: 10,
      stages: { forwardEncodeMs: 3 },
      changedCells: 4,
      forwardBytes: 5,
      inverseBytes: 6,
      operationDelta: 1,
      historyActionDelta: 1,
      cellDelta: 4,
    }]);
    expect(summary.stages.forwardEncodeMs.median).toBe(3);
    expect(summary.operationDelta.median).toBe(1);
  });
});
