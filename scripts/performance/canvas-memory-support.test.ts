import { describe, expect, it } from "vitest";
import {
  CANVAS_MEMORY_SCHEMA,
  createCanvasMemoryMarkdown,
  evaluateCanvasMemoryRuns,
  linearSlope,
  summarize,
  type CanvasMemoryCheckpoint,
  type CanvasMemoryReport,
  type CanvasMemoryRun,
} from "./canvas-memory-support";

const checkpoint = (
  heapUsedBytes: number,
  overrides: Partial<CanvasMemoryCheckpoint> = {}
): CanvasMemoryCheckpoint => ({
  heapUsedBytes,
  heapTotalBytes: heapUsedBytes * 2,
  embedderHeapUsedBytes: 0,
  backingStorageBytes: 0,
  documents: 1,
  nodes: 100,
  liveDomNodes: 90,
  detachedDomNodesEstimate: 10,
  jsEventListeners: 10,
  canvasBackingBytes: 1000,
  engine: {
    documents: 1,
    pages: 1,
    residentPageIndexes: 1,
    projectionCacheEntries: 0,
    projectionCacheBudgetBytes: 0,
    projectionCacheBudgetLimit: 1024,
  },
  ...overrides,
});

const run: CanvasMemoryRun = {
  checkpoints: {
    baselineAfterGc: checkpoint(10_000_000),
    loadedAfterGc: checkpoint(15_000_000),
    retainedAfterGc: checkpoint(16_000_000),
    releasedAfterGc: checkpoint(10_500_000),
  },
  interactionPeakHeapBytes: 20_000_000,
  cycleRetainedHeapBytes: [10_500_000, 10_600_000, 10_700_000],
  render: {
    contentFrames: 3,
    fullContentFrames: 3,
    partialContentFrames: 0,
    glyphs: 300,
    dirtyCellArea: 0,
  },
  input: {
    batches: 10,
    textLength: 100,
    firstBatches: 1,
    burstBatches: 9,
    boundaryBatches: 0,
    imeBatches: 0,
    firstCommitP95Ms: 12,
    burstCommitP95Ms: 50,
    burstCommitMaxMs: 52,
  },
};

describe("canvas memory support", () => {
  it("summarizes distributions and lifecycle slope", () => {
    expect(summarize([3, 1, 2])).toEqual({ samples: 3, min: 1, median: 2, p95: 3 });
    expect(linearSlope([10, 20, 30])).toBe(10);
    const evaluated = evaluateCanvasMemoryRuns([run]);
    expect(evaluated.failures).toEqual([]);
    expect(evaluated.summary.releasedResidualBytes.median).toBe(500_000);
    expect(evaluated.summary.renderedGlyphs.median).toBe(300);
    expect(evaluated.summary.historyActions.median).toBe(0);
    expect(evaluated.summary.inputBatches.median).toBe(10);
  });

  it("flags budget and lifecycle retention failures", () => {
    const failing: CanvasMemoryRun = {
      ...run,
      checkpoints: {
        ...run.checkpoints,
        releasedAfterGc: checkpoint(15_000_000, {
          nodes: 200,
          detachedDomNodesEstimate: 100,
          jsEventListeners: 20,
          engine: {
            documents: 2,
            pages: 2,
            residentPageIndexes: 2,
            projectionCacheEntries: 1,
            projectionCacheBudgetBytes: 2048,
            projectionCacheBudgetLimit: 1024,
            historyDocuments: 1,
            historyGroups: 1,
            historyActions: 1,
            historyBytes: 512,
            unattributedProjectionCacheEntries: 1,
            unattributedProjectionCacheBytes: 256,
          },
        }),
      },
      cycleRetainedHeapBytes: [10_000_000, 11_000_000, 12_000_000],
    };
    expect(evaluateCanvasMemoryRuns([failing]).failures).toEqual(expect.arrayContaining([
      "released-heap-residual",
      "dom-node-residual",
      "detached-dom-node-residual",
      "listener-residual",
      "cycle-heap-slope",
      "projection-budget",
      "unattributed-projection-cache-entries",
      "unattributed-projection-cache-bytes",
      "released-documents",
      "released-historyDocuments",
      "released-historyBytes",
    ]));
  });

  it("renders a report with explicit scope", () => {
    const evaluated = evaluateCanvasMemoryRuns([run]);
    const report: CanvasMemoryReport = {
      schemaVersion: CANVAS_MEMORY_SCHEMA,
      generatedAt: "2026-09-04T00:00:00.000Z",
      gitCommit: "abc123",
      gitDirty: false,
      scope: "page-engine",
      exclusions: ["worker heaps", "GPU memory", "browser RSS"],
      environment: {
        platform: "darwin",
        architecture: "arm64",
        cpu: "test",
        cpuCount: 8,
        node: "v26",
        browser: "Chromium",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
      settings: {
        measuredRuns: 1,
        sampleIntervalMs: 100,
        gcPasses: 2,
        renderMode: "normal",
        inputMode: "canvas",
        allocationSampling: false,
        inputCommitCadenceMs: "frame",
        inputDelayMs: 0,
      },
      thresholds: {
        maxReleasedHeapResidualBytes: 4 * 1024 * 1024,
        maxReleasedHeapResidualRatio: 0.1,
        maxDomNodeResidual: 32,
        maxDetachedDomNodeResidual: 32,
        maxListenerResidual: 4,
        maxCycleHeapSlopeBytes: 256 * 1024,
        maxComparisonRegressionBytes: 1024 * 1024,
        maxComparisonRegressionRatio: 0.05,
      },
      workloads: [{
        id: "unicode-25k",
        label: "25k Unicode",
        description: "test",
        runs: [run],
        summary: evaluated.summary,
        passed: true,
        failures: [],
      }],
    };
    expect(createCanvasMemoryMarkdown(report)).toContain("worker heaps");
    expect(createCanvasMemoryMarkdown(report)).toContain("25k Unicode");
    expect(createCanvasMemoryMarkdown(report)).toContain("Released history");
    expect(createCanvasMemoryMarkdown(report)).toContain("Unattributed cache");
    expect(createCanvasMemoryMarkdown(report)).toContain("Rendered glyphs");
  });
});
