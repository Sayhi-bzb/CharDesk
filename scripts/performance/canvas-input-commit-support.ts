export const CANVAS_INPUT_COMMIT_SCHEMA = 1;

export type InputCommitDistribution = {
  samples: number;
  min: number;
  median: number;
  p95: number;
  max: number;
};

export type InputCommitSample = {
  totalMs: number;
  stages: Record<string, number>;
  changedCells: number;
  forwardBytes: number;
  inverseBytes: number;
  operationDelta: number;
  historyActionDelta: number;
  cellDelta: number;
};

export type InputCommitWorkload = {
  id: string;
  label: string;
  characterSet: 'ascii' | 'unicode';
  target: 'empty' | 'overwrite';
  textLength: number;
  samples: InputCommitSample[];
  summary: {
    totalMs: InputCommitDistribution;
    stages: Record<string, InputCommitDistribution>;
    changedCells: InputCommitDistribution;
    forwardBytes: InputCommitDistribution;
    inverseBytes: InputCommitDistribution;
    operationDelta: InputCommitDistribution;
    historyActionDelta: InputCommitDistribution;
    cellDelta: InputCommitDistribution;
  };
};

export type InputCommitReport = {
  schemaVersion: number;
  generatedAt: string;
  label?: string;
  gitCommit: string;
  gitDirty: boolean;
  settings: { warmups: number; measuredRuns: number; implementation: 'legacy' | 'paired' };
  hypothesis: {
    id: 'H6-paired-operation-builder';
    minimumEncodeShare: number;
    supported: boolean;
    encodeShareByWorkload: Record<string, number>;
  };
  workloads: InputCommitWorkload[];
};

export const summarizeInputCommitValues = (
  values: readonly number[]
): InputCommitDistribution => {
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

export const summarizeInputCommitSamples = (
  samples: readonly InputCommitSample[]
): InputCommitWorkload['summary'] => {
  const stageNames = [...new Set(samples.flatMap((sample) => Object.keys(sample.stages)))];
  return {
    totalMs: summarizeInputCommitValues(samples.map((sample) => sample.totalMs)),
    stages: Object.fromEntries(stageNames.map((stage) => [
      stage,
      summarizeInputCommitValues(samples.map((sample) => sample.stages[stage] ?? 0)),
    ])),
    changedCells: summarizeInputCommitValues(samples.map((sample) => sample.changedCells)),
    forwardBytes: summarizeInputCommitValues(samples.map((sample) => sample.forwardBytes)),
    inverseBytes: summarizeInputCommitValues(samples.map((sample) => sample.inverseBytes)),
    operationDelta: summarizeInputCommitValues(samples.map((sample) => sample.operationDelta)),
    historyActionDelta: summarizeInputCommitValues(
      samples.map((sample) => sample.historyActionDelta)
    ),
    cellDelta: summarizeInputCommitValues(samples.map((sample) => sample.cellDelta)),
  };
};

export const evaluatePairedOperationHypothesis = (
  workloads: readonly InputCommitWorkload[],
  minimumEncodeShare = 0.4
): InputCommitReport['hypothesis'] => {
  const evaluated = workloads.filter(({ textLength }) => textLength >= 1_000);
  const encodeShareByWorkload = Object.fromEntries(evaluated.map((workload) => {
    const forward = workload.summary.stages.forwardEncodeMs?.median ?? 0;
    const inverse = workload.summary.stages.inverseEncodeMs?.median ?? 0;
    const total = workload.summary.totalMs.median;
    return [workload.id, total > 0 ? (forward + inverse) / total : 0];
  }));
  return {
    id: 'H6-paired-operation-builder',
    minimumEncodeShare,
    supported:
      evaluated.length > 0 &&
      Object.values(encodeShareByWorkload).every((share) => share >= minimumEncodeShare),
    encodeShareByWorkload,
  };
};

export const createInputCommitMarkdown = (report: InputCommitReport) => {
  const lines = [
    '# Canvas input commit report',
    '',
    `Generated: ${report.generatedAt}`,
    ...(report.label ? [`Label: ${report.label}`] : []),
    `Commit: \`${report.gitCommit}\`${report.gitDirty ? ' (dirty)' : ''}`,
    `Implementation: ${report.settings.implementation}; ${report.settings.measuredRuns} measured runs after ${report.settings.warmups} warmups.`,
    `Hypothesis H6: ${report.hypothesis.supported ? 'supported' : 'rejected'}; paired encoding must account for at least ${(report.hypothesis.minimumEncodeShare * 100).toFixed(0)}% of total commit time.`,
    '',
    '| Workload | Total median / P95 / max | Text/state | Mutation | Normalize | Forward | Inverse | Encode share | Yjs push | Transaction | History | Changed cells | Bytes F/I | Ops/history |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const stage = (workload: InputCommitWorkload, name: string) =>
    (workload.summary.stages[name]?.median ?? 0).toFixed(2);
  report.workloads.forEach((workload) => {
    const summary = workload.summary;
    lines.push(
      `| ${workload.label} | ${summary.totalMs.median.toFixed(2)} / ${summary.totalMs.p95.toFixed(2)} / ${summary.totalMs.max.toFixed(2)} ms | ${stage(workload, 'textPreparationAndStateMs')} | ${stage(workload, 'mutationMs')} | ${stage(workload, 'normalizeMs')} | ${stage(workload, 'forwardEncodeMs')} | ${stage(workload, 'inverseEncodeMs')} | ${((report.hypothesis.encodeShareByWorkload[workload.id] ?? 0) * 100).toFixed(1)}% | ${stage(workload, 'yjsPushMs')} | ${stage(workload, 'transactionOverheadMs')} | ${stage(workload, 'historyCaptureMs')} | ${summary.changedCells.median.toFixed(0)} | ${summary.forwardBytes.median.toFixed(0)}/${summary.inverseBytes.median.toFixed(0)} | ${summary.operationDelta.median.toFixed(0)}/${summary.historyActionDelta.median.toFixed(0)} |`
    );
  });
  lines.push('');
  return lines.join('\n');
};
