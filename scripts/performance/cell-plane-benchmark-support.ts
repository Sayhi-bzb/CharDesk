export const CELL_PLANE_BENCHMARK_SCHEMA = 3;

export const CELL_PLANE_PHASES = [
  "construct",
  "coldProjection",
  "hotProjection",
  "hotRenderPreparation",
  "append",
  "invalidatedProjection",
  "invalidatedRenderPreparation",
] as const;

export type CellPlanePhase = (typeof CELL_PLANE_PHASES)[number];

export interface Distribution {
  samples: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
}

export interface CellPlaneBenchmarkResult {
  schemaVersion: number;
  generatedAt: string;
  label?: string;
  gitCommit: string;
  gitDirty: boolean;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpu: string;
    cpuCount: number;
  };
  settings: {
    warmupRuns: number;
    measuredRuns: number;
    hotProjectionRepeats: number;
    hotRenderRepeats: number;
  };
  workloads: Array<{
    id: string;
    label: string;
    description: string;
    operationCount: number;
    sourceCellCount: number;
    projectedCellCount: number;
    projectionChecksum: number;
    renderedCellCount: number;
    renderedGlyphCount: number;
    fillTextCalls: number;
    invalidatedRenderedCellCount: number;
    invalidatedRenderedGlyphCount: number;
    invalidatedFillTextCalls: number;
    chunkCount: number;
    encodedPayloadBytes: number;
    residentBytes: number;
    totalResidentBytes: number;
    phases: Record<CellPlanePhase, Distribution>;
  }>;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function summarize(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { samples: 0, minMs: 0, medianMs: 0, p95Ms: 0 };
  }
  return {
    samples: values.length,
    minMs: round(Math.min(...values)),
    medianMs: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
  };
}

export function formatCellPlaneBenchmarkMarkdown(result: CellPlaneBenchmarkResult): string {
  const lines = [
    "# CellPlane performance measurement",
    "",
    `Generated: ${result.generatedAt}`,
    ...(result.label ? [`Label: ${result.label}`] : []),
    `Commit: \`${result.gitCommit}\`${result.gitDirty ? " (dirty)" : ""}`,
    `Runtime: ${result.environment.node} on ${result.environment.platform}/${result.environment.arch}`,
    `CPU: ${result.environment.cpu} (${result.environment.cpuCount} logical cores)`,
    `Sampling: ${result.settings.warmupRuns} warmups, ${result.settings.measuredRuns} measured runs, ${result.settings.hotProjectionRepeats} hot projections and ${result.settings.hotRenderRepeats} hot render preparations per sample`,
    "",
    "Times are wall-clock milliseconds. Hot projection values are normalized to one projection.",
    "",
  ];

  for (const workload of result.workloads) {
    lines.push(
      `## ${workload.label}`,
      "",
      workload.description,
      "",
      `Operations: ${workload.operationCount}; source cells: ${workload.sourceCellCount}; projected anchors: ${workload.projectedCellCount}; projection checksum: ${workload.projectionChecksum}; rendered cells: ${workload.renderedCellCount}; rendered glyphs: ${workload.renderedGlyphCount}; fillText calls: ${workload.fillTextCalls}; invalidated rendered cells: ${workload.invalidatedRenderedCellCount}; invalidated rendered glyphs: ${workload.invalidatedRenderedGlyphCount}; invalidated fillText calls: ${workload.invalidatedFillTextCalls}; projected chunks: ${workload.chunkCount}; encoded payload: ${workload.encodedPayloadBytes} B; chunk cache: ${workload.residentBytes} B; total projection residency: ${workload.totalResidentBytes} B.`,
      "",
      "| Phase | Min (ms) | Median (ms) | p95 (ms) | Samples |",
      "| --- | ---: | ---: | ---: | ---: |",
    );
    for (const phase of CELL_PLANE_PHASES) {
      const distribution = workload.phases[phase];
      lines.push(
        `| ${phase} | ${distribution.minMs.toFixed(3)} | ${distribution.medianMs.toFixed(3)} | ${distribution.p95Ms.toFixed(3)} | ${distribution.samples} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
