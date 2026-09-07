export const CANVAS_INPUT_SCHEDULING_SCHEMA = 1;

export type InputSchedulingDistribution = {
  samples: number;
  min: number;
  median: number;
  p95: number;
  max: number;
};

export type InputSchedulingSample = {
  queueP95Ms: number;
  queueMaxMs: number;
  commitP95Ms: number;
  commitMaxMs: number;
  endToEndP95Ms: number;
  endToEndMaxMs: number;
  batchTextLengthP95: number;
  batchTextLengthMax: number;
  batches: number;
  firstBatches: number;
  burstBatches: number;
  capacityBatches: number;
  boundaryBatches: number;
  operationDelta: number;
  historyActionDelta: number;
};

export type InputSchedulingWorkload = {
  id: string;
  label: string;
  policy: 'unbounded' | 'bounded-512';
  inputMode: 'type' | 'insert-text';
  characterSet: 'ascii' | 'unicode';
  textLength: number;
  delayMs: number;
  samples: InputSchedulingSample[];
  summary: Record<keyof InputSchedulingSample, InputSchedulingDistribution>;
};

export type InputSchedulingHypothesis = {
  id: 'H7-bounded-managed-input';
  supported: boolean;
  baselineReproduced: boolean;
  baselineQueueP95Ms: number;
  candidateQueueP95Ms: number;
  queueReduction: number;
  candidateCommitP95Ms: number;
  candidateOperationP95: number;
  pacedQueueRegressionMs: number;
  pacedOperationRegression: number;
  failures: string[];
};

export type InputSchedulingReport = {
  schemaVersion: number;
  generatedAt: string;
  label?: string;
  gitCommit: string;
  gitDirty: boolean;
  settings: { warmups: number; measuredRuns: number; cadenceMs: number; batchLimit: number };
  hypothesis: InputSchedulingHypothesis;
  workloads: InputSchedulingWorkload[];
};

const sampleKeys = [
  'queueP95Ms',
  'queueMaxMs',
  'commitP95Ms',
  'commitMaxMs',
  'endToEndP95Ms',
  'endToEndMaxMs',
  'batchTextLengthP95',
  'batchTextLengthMax',
  'batches',
  'firstBatches',
  'burstBatches',
  'capacityBatches',
  'boundaryBatches',
  'operationDelta',
  'historyActionDelta',
] as const satisfies readonly (keyof InputSchedulingSample)[];

export const summarizeInputSchedulingValues = (
  values: readonly number[]
): InputSchedulingDistribution => {
  if (values.length === 0) return { samples: 0, min: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]!;
  return {
    samples: sorted.length,
    min: sorted[0]!,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1)!,
  };
};

export const summarizeInputSchedulingSamples = (
  samples: readonly InputSchedulingSample[]
): InputSchedulingWorkload['summary'] => Object.fromEntries(
  sampleKeys.map((key) => [
    key,
    summarizeInputSchedulingValues(samples.map((sample) => sample[key])),
  ])
) as InputSchedulingWorkload['summary'];

export const evaluateInputSchedulingHypothesis = (
  workloads: readonly InputSchedulingWorkload[]
): InputSchedulingHypothesis => {
  const find = (id: string) => workloads.find((workload) => workload.id === id);
  const baseline = find('unbounded-ascii-type-0ms-2500');
  const candidate = find('bounded-512-ascii-type-0ms-2500');
  const pacedBaseline = find('unbounded-ascii-type-5ms-250');
  const pacedCandidate = find('bounded-512-ascii-type-5ms-250');
  const baselineQueueP95Ms = baseline?.summary.queueP95Ms.p95 ?? 0;
  const candidateQueueP95Ms = candidate?.summary.queueP95Ms.p95 ?? Infinity;
  const queueReduction = baselineQueueP95Ms > 0
    ? 1 - candidateQueueP95Ms / baselineQueueP95Ms
    : 0;
  const candidateCommitP95Ms = candidate?.summary.commitP95Ms.p95 ?? Infinity;
  const candidateOperationP95 = candidate?.summary.operationDelta.p95 ?? Infinity;
  const pacedQueueRegressionMs =
    (pacedCandidate?.summary.queueP95Ms.p95 ?? Infinity) -
    (pacedBaseline?.summary.queueP95Ms.p95 ?? 0);
  const pacedOperationRegression =
    (pacedCandidate?.summary.operationDelta.p95 ?? Infinity) -
    (pacedBaseline?.summary.operationDelta.p95 ?? 0);
  const failures: string[] = [];
  if (baselineQueueP95Ms < 200) failures.push('baseline queue P95 did not reproduce 200 ms');
  if (candidateQueueP95Ms > 100) failures.push('candidate queue P95 exceeded 100 ms');
  if (queueReduction < 0.7) failures.push('candidate queue reduction was below 70%');
  if (candidateCommitP95Ms > 8) failures.push('candidate commit P95 exceeded 8 ms');
  if (candidateOperationP95 > 6) failures.push('candidate operation P95 exceeded 6');
  if (pacedQueueRegressionMs > 10) failures.push('paced queue P95 regressed by more than 10 ms');
  if (pacedOperationRegression > 1) failures.push('paced operation count regressed by more than 1');
  return {
    id: 'H7-bounded-managed-input',
    supported: failures.length === 0,
    baselineReproduced: baselineQueueP95Ms >= 200,
    baselineQueueP95Ms,
    candidateQueueP95Ms,
    queueReduction,
    candidateCommitP95Ms,
    candidateOperationP95,
    pacedQueueRegressionMs,
    pacedOperationRegression,
    failures,
  };
};

export const createInputSchedulingMarkdown = (report: InputSchedulingReport): string => {
  const lines = [
    '# Canvas managed-input scheduling report',
    '',
    `Generated: ${report.generatedAt}`,
    ...(report.label ? [`Label: ${report.label}`] : []),
    `Commit: \`${report.gitCommit}\`${report.gitDirty ? ' (dirty)' : ''}`,
    `Experiment: ${report.settings.measuredRuns} measured runs after ${report.settings.warmups} warmups; cadence=${report.settings.cadenceMs} ms; candidate pending threshold=${report.settings.batchLimit} code units (atomic browser input events are not split).`,
    `Hypothesis H7: ${report.hypothesis.supported ? 'supported' : 'rejected'}${report.hypothesis.failures.length ? ` (${report.hypothesis.failures.join('; ')})` : ''}.`,
    '',
    '| Workload | Queue P95 / max | Commit P95 / max | End-to-end P95 / max | Batch text P95 / max | Batches | F/B/C/X | Ops/history |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  report.workloads.forEach((workload) => {
    const value = (key: keyof InputSchedulingSample) => workload.summary[key].p95.toFixed(1);
    lines.push(
      `| ${workload.label} | ${value('queueP95Ms')} / ${value('queueMaxMs')} ms | ${value('commitP95Ms')} / ${value('commitMaxMs')} ms | ${value('endToEndP95Ms')} / ${value('endToEndMaxMs')} ms | ${value('batchTextLengthP95')} / ${value('batchTextLengthMax')} | ${value('batches')} | ${value('firstBatches')}/${value('burstBatches')}/${value('capacityBatches')}/${value('boundaryBatches')} | ${value('operationDelta')}/${value('historyActionDelta')} |`
    );
  });
  lines.push('');
  return lines.join('\n');
};
