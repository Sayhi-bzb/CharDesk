import { describe, expect, it } from "vitest";

import {
  CELL_PLANE_BENCHMARK_SCHEMA,
  formatCellPlaneBenchmarkMarkdown,
  percentile,
  summarize,
  type CellPlaneBenchmarkResult,
} from "./cell-plane-benchmark-support";

describe("cell-plane benchmark support", () => {
  it("computes nearest-rank distributions", () => {
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(summarize([1.0004, 2.0004, 3.0004])).toEqual({
      samples: 3,
      minMs: 1,
      medianMs: 2,
      p95Ms: 3,
    });
    expect(summarize([])).toEqual({ samples: 0, minMs: 0, medianMs: 0, p95Ms: 0 });
  });

  it("renders a stable report table", () => {
    const distribution = { samples: 2, minMs: 1, medianMs: 2, p95Ms: 3 };
    const result: CellPlaneBenchmarkResult = {
      schemaVersion: CELL_PLANE_BENCHMARK_SCHEMA,
      generatedAt: "2026-09-04T00:00:00.000Z",
      label: "baseline",
      gitCommit: "abc123",
      gitDirty: false,
      environment: {
        node: "v24.0.0",
        platform: "darwin",
        arch: "arm64",
        cpu: "test cpu",
        cpuCount: 8,
      },
      settings: {
        warmupRuns: 2,
        measuredRuns: 2,
        hotProjectionRepeats: 10,
        hotRenderRepeats: 10,
      },
      workloads: [
        {
          id: "ascii",
          label: "ASCII",
          description: "ASCII workload.",
          operationCount: 1,
          sourceCellCount: 100,
          projectedCellCount: 10,
          projectionChecksum: 1234,
          renderedCellCount: 10,
          renderedGlyphCount: 10,
          fillTextCalls: 10,
          invalidatedRenderedCellCount: 10,
          invalidatedRenderedGlyphCount: 10,
          invalidatedFillTextCalls: 10,
          chunkCount: 1,
          encodedPayloadBytes: 50,
          residentBytes: 1600,
          totalResidentBytes: 1600,
          phases: {
            construct: distribution,
            coldProjection: distribution,
            hotProjection: distribution,
            hotRenderPreparation: distribution,
            append: distribution,
            invalidatedProjection: distribution,
            invalidatedRenderPreparation: distribution,
          },
        },
      ],
    };

    const markdown = formatCellPlaneBenchmarkMarkdown(result);
    expect(markdown).toContain("# CellPlane performance measurement");
    expect(markdown).toContain("| coldProjection | 1.000 | 2.000 | 3.000 | 2 |");
    expect(markdown).toContain("Operations: 1; source cells: 100");
    expect(markdown).toContain("invalidated rendered cells: 10");
  });
});
