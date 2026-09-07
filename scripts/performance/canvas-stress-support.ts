export const CANVAS_STRESS_THRESHOLDS = Object.freeze({
  p95FrameMs: 24,
  maxOver50msFrames: 2,
  maxInputPaintMs: 100,
  maxJsHeapBytes: 256 * 1024 * 1024,
});

export type CanvasStressMetrics = {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  over32ms: number;
  over50ms: number;
  longTaskCount: number;
  maxLongTaskMs: number;
  longAnimationFrameCount: number;
  maxLongAnimationFrameMs: number;
  maxBlockingDurationMs: number;
  inputPaintMs: number | null;
  coldInputPaintMs?: number | null;
  jsHeapBytes: number | null;
  jsHeapBeforeGcBytes?: number | null;
  canvasBackingBytes: number;
  localStorageBytes: number;
};

export type CanvasStressLevel = {
  family: "freeform-sparse" | "freeform-dense" | "freeform-unicode" | "freeform-history" | "zoom" | "structured" | "residency" | "persistence";
  label: string;
  cellCount?: number;
  nodeCount?: number;
  operationCount?: number;
  projectedCellCount?: number | null;
  surfaceStats?: Readonly<Record<string, number>>;
  memoryStats?: Readonly<Record<string, number>>;
  resourceStats?: Readonly<Record<string, number | boolean | string>>;
  zoom: number;
  snapshotBytes: number;
  persistenceMs?: number | null;
  storageError?: string | null;
  runtimeErrors: readonly string[];
  metrics: CanvasStressMetrics | null;
  passed: boolean;
  failures: readonly string[];
};

export type CanvasStressReport = {
  generatedAt: string;
  environment: {
    platform: string;
    architecture: string;
    cpu: string;
    cpuCount: number;
    node: string;
    browser: string;
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
  };
  thresholds: typeof CANVAS_STRESS_THRESHOLDS;
  completedFamilies: CanvasStressLevel["family"][];
  levels: CanvasStressLevel[];
};

export const percentile = (values: readonly number[], ratio: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!;
};

export const evaluateCanvasStressLevel = ({
  metrics,
  runtimeErrors,
  storageError,
  resourceStats,
}: Pick<
  CanvasStressLevel,
  "metrics" | "runtimeErrors" | "storageError" | "resourceStats"
>) => {
  const failures: string[] = [];
  if (!metrics) failures.push("metrics-unavailable");
  if (metrics && metrics.p95FrameMs > CANVAS_STRESS_THRESHOLDS.p95FrameMs) {
    failures.push("p95-frame");
  }
  if (metrics && metrics.over50ms > CANVAS_STRESS_THRESHOLDS.maxOver50msFrames) {
    failures.push("over-50ms-frames");
  }
  if (
    metrics?.inputPaintMs !== null &&
    metrics?.inputPaintMs !== undefined &&
    metrics.inputPaintMs > CANVAS_STRESS_THRESHOLDS.maxInputPaintMs
  ) {
    failures.push("input-paint");
  }
  if (metrics && metrics.inputPaintMs === null) failures.push("input-paint-unavailable");
  if (
    metrics?.jsHeapBytes !== null &&
    metrics?.jsHeapBytes !== undefined &&
    metrics.jsHeapBytes > CANVAS_STRESS_THRESHOLDS.maxJsHeapBytes
  ) {
    failures.push("js-heap");
  }
  if (runtimeErrors.length > 0) failures.push("runtime-error");
  if (storageError) failures.push("storage-error");
  if (resourceStats?.pressure === "critical") failures.push("memory-critical");
  return failures;
};

const formatBytes = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined) return "—";
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
};

const formatNumber = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "—" : value.toFixed(digits);

export const summarizeCanvasStressFamilies = (levels: readonly CanvasStressLevel[]) => {
  const families = [...new Set(levels.map((level) => level.family))];
  return families.map((family) => {
    const familyLevels = levels.filter((level) => level.family === family);
    const lastPassing = [...familyLevels].reverse().find((level) => level.passed) ?? null;
    const firstFailure = familyLevels.find((level) => !level.passed) ?? null;
    return { family, lastPassing, firstFailure };
  });
};

export const createCanvasStressMarkdown = (report: CanvasStressReport) => {
  const expectedFamilies: CanvasStressLevel["family"][] = [
    "freeform-sparse",
    "freeform-dense",
    "freeform-unicode",
    "freeform-history",
    "zoom",
    "structured",
    "residency",
    "persistence",
  ];
  const missingFamilies = expectedFamilies.filter(
    (family) => !report.completedFamilies.includes(family)
  );
  const lines = [
    "# Canvas stress report",
    "",
    `Generated: ${report.generatedAt}`,
    `Environment: ${report.environment.browser}; ${report.environment.cpuCount} × ${report.environment.cpu}; ${report.environment.platform}/${report.environment.architecture}`,
    `Viewport: ${report.environment.viewport.width} × ${report.environment.viewport.height} at DPR ${report.environment.deviceScaleFactor}`,
    ...(missingFamilies.length
      ? [`Status: INCOMPLETE — missing ${missingFamilies.join(", ")}`]
      : ["Status: complete"]),
    "",
    "## Boundaries",
    "",
    "| Family | Last passing | First failure | Reason |",
    "| --- | --- | --- | --- |",
  ];

  summarizeCanvasStressFamilies(report.levels).forEach(({ family, lastPassing, firstFailure }) => {
    lines.push(
      `| ${family} | ${lastPassing?.label ?? "none"} | ${firstFailure?.label ?? "not reached"} | ${firstFailure?.failures.join(", ") || "—"} |`
    );
  });

  lines.push(
    "",
    "## Levels",
    "",
    "| Family | Level | Result | p95 / p99 frame | LoAF | >50ms | Input cold / p95 | Heap | Projection / budget | Pressure | Render p95 | Long renders | Authority payload | Projection cache | Canvas | Snapshot | Persistence |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  report.levels.forEach((level) => {
    lines.push(
      `| ${level.family} | ${level.label} | ${level.passed ? "pass" : `fail: ${level.failures.join(", ")}`} | ${formatNumber(level.metrics?.p95FrameMs)} / ${formatNumber(level.metrics?.p99FrameMs)} ms | ${level.metrics?.longAnimationFrameCount ?? "—"} | ${level.metrics?.over50ms ?? "—"} | ${formatNumber(level.metrics?.coldInputPaintMs)} / ${formatNumber(level.metrics?.inputPaintMs)} ms | ${formatBytes(level.metrics?.jsHeapBytes)} | ${formatBytes(level.resourceStats?.accountedBytes as number | undefined)} / ${formatBytes(level.resourceStats?.nominalBudgetBytes as number | undefined)} | ${level.resourceStats?.pressure ?? "—"} | ${formatNumber(level.resourceStats?.p95FrameDurationMs as number | undefined)} ms | ${level.resourceStats?.longFrames ?? "—"} | ${formatBytes(level.memoryStats?.encodedPayloadBytes)} | ${formatBytes(level.memoryStats?.projectionCacheBudgetBytes)} | ${formatBytes(level.metrics?.canvasBackingBytes)} | ${formatBytes(level.snapshotBytes)} | ${formatNumber(level.persistenceMs)} ms |`
    );
  });
  lines.push("");
  return lines.join("\n");
};
