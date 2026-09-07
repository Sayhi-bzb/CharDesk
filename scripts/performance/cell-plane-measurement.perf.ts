import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { expect, test } from "vitest";

import {
  CellPlaneIndex,
  cellPlanePatchToOperation,
  type CellPlaneOperation,
  type CellPlanePatch,
} from "@/domains/canvas/cell-plane/model";
import type { GridCell, NodeBounds } from "@/shared/types";
import { drawGridLayer } from "@/widgets/canvas-editor/rendering/drawGridLayer";

import {
  CELL_PLANE_BENCHMARK_SCHEMA,
  CELL_PLANE_PHASES,
  formatCellPlaneBenchmarkMarkdown,
  summarize,
  type CellPlaneBenchmarkResult,
  type CellPlanePhase,
} from "./cell-plane-benchmark-support";

const DEFAULT_WARMUP_RUNS = 5;
const DEFAULT_MEASURED_RUNS = 20;
const DEFAULT_HOT_PROJECTION_REPEATS = 40;
const DEFAULT_HOT_RENDER_REPEATS = 40;

interface Workload {
  id: string;
  label: string;
  description: string;
  operations: CellPlaneOperation[];
  invalidation: CellPlaneOperation;
  bounds: NodeBounds;
  sourceCellCount: number;
}

interface ProjectionDigest {
  count: number;
  checksum: number;
}

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const operation = (id: string, patch: CellPlanePatch): CellPlaneOperation => {
  const encoded = cellPlanePatchToOperation(id, patch);
  if (!encoded) throw new Error(`Benchmark operation ${id} was empty`);
  return encoded;
};

const spanOperation = (id: string, y: number, x: number, text: string) =>
  operation(id, {
    rows: [{ y, erase: [], spans: [{ x, text, color: "#ffffff" }] }],
  });

const eraseOperation = (id: string, y: number, from: number, to: number) =>
  operation(id, {
    rows: [{ y, erase: [{ from, to }], spans: [] }],
  });

const makeWorkloads = (): Workload[] => {
  const asciiText = "CHARDESK".repeat(1_024);
  const unicodePattern = "你👩🏽‍💻é";
  const unicodeText = unicodePattern.repeat(1_600);

  const historyOperations = [spanOperation("history-base", 0, 0, ".".repeat(256))];
  for (let index = 0; index < 768; index += 1) {
    const x = index % 256;
    historyOperations.push(
      index % 5 === 0
        ? eraseOperation(`history-${index}`, 0, x, x)
        : spanOperation(`history-${index}`, 0, x, String(index % 10)),
    );
  }

  const overlapOperations = [
    spanOperation("overlap-base", 0, 0, "-".repeat(384)),
    spanOperation("overlap-wide-boundary", 0, 127, "你"),
  ];
  for (let index = 0; index < 384; index += 1) {
    const x = 120 + (index % 24);
    overlapOperations.push(
      index % 3 === 0
        ? eraseOperation(`overlap-erase-${index}`, 0, x, x + 1)
        : spanOperation(`overlap-write-${index}`, 0, x, index % 2 === 0 ? "界" : "🙂"),
    );
  }

  const denseViewportOperation = operation("dense-viewport-base", {
    rows: Array.from({ length: 64 }, (_, y) => ({
      y,
      erase: [],
      spans: [{ x: 0, text: ".".repeat(128), color: "#ffffff" }],
    })),
  });
  const mixedUnicodeRow = `${"A你🙂é".repeat(21)}AA`;
  const mixedUnicodeViewportOperation = operation("mixed-unicode-viewport-base", {
    rows: Array.from({ length: 64 }, (_, y) => ({
      y,
      erase: [],
      spans: [{ x: 0, text: mixedUnicodeRow, color: "#ffffff" }],
    })),
  });

  return [
    {
      id: "ascii-long-span",
      label: "ASCII long span",
      description: "One encoded ASCII span projected from the middle of a long row.",
      operations: [spanOperation("ascii-base", 0, 0, asciiText)],
      invalidation: spanOperation("ascii-invalidate", 0, 4_100, "X"),
      bounds: { x: 4_096, y: 0, width: 256, height: 1 },
      sourceCellCount: asciiText.length,
    },
    {
      id: "unicode-long-span",
      label: "Unicode long span",
      description: "CJK, emoji ZWJ sequences, and combining marks projected from a long row.",
      operations: [spanOperation("unicode-base", 0, 0, unicodeText)],
      invalidation: spanOperation("unicode-invalidate", 0, 4_100, "Ω"),
      bounds: { x: 4_096, y: 0, width: 256, height: 1 },
      sourceCellCount: 8_000,
    },
    {
      id: "deep-history",
      label: "Deep edit history",
      description: "Hundreds of localized writes and erases replayed into two adjacent chunks.",
      operations: historyOperations,
      invalidation: spanOperation("history-invalidate", 0, 64, "Ω"),
      bounds: { x: 0, y: 0, width: 256, height: 1 },
      sourceCellCount: 1_024,
    },
    {
      id: "wide-overlap-boundary",
      label: "Wide-character overlap at chunk boundary",
      description: "Wide graphemes, overwrites, and erases around the x=128 chunk boundary.",
      operations: overlapOperations,
      invalidation: eraseOperation("overlap-invalidate", 0, 127, 128),
      bounds: { x: 112, y: 0, width: 48, height: 1 },
      sourceCellCount: 1_154,
    },
    {
      id: "dense-viewport-traversal",
      label: "Dense viewport traversal",
      description:
        "One fully occupied 128 by 64 chunk traversed from the resident cache.",
      operations: [denseViewportOperation],
      invalidation: spanOperation("dense-viewport-invalidate", 32, 64, "X"),
      bounds: { x: 0, y: 0, width: 128, height: 64 },
      sourceCellCount: 8_192,
    },
    {
      id: "mixed-unicode-viewport",
      label: "Mixed-Unicode viewport",
      description:
        "A full viewport of ASCII, CJK, emoji, and combining-mark graphemes.",
      operations: [mixedUnicodeViewportOperation],
      invalidation: spanOperation("mixed-unicode-viewport-invalidate", 32, 64, "Ω"),
      bounds: { x: 0, y: 0, width: 128, height: 64 },
      sourceCellCount: 5_504,
    },
  ];
};

let digestSink = 0;

const project = (plane: CellPlaneIndex, bounds: NodeBounds): ProjectionDigest => {
  let count = 0;
  let checksum = 0;
  plane.visitCells(bounds, (x: number, y: number, cell: GridCell) => {
    count += 1;
    checksum = (checksum + x * 31 + y * 17 + (cell.char.codePointAt(0) ?? 0)) >>> 0;
  });
  digestSink ^= checksum;
  return { count, checksum };
};

const createRenderProbe = () => {
  let fillTextCalls = 0;
  const context = {
    save() {},
    restore() {},
    fillText() { fillTextCalls += 1; },
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return {
    context,
    getFillTextCalls: () => fillTextCalls,
    reset: () => { fillTextCalls = 0; },
  };
};

const render = (
  plane: CellPlaneIndex,
  bounds: NodeBounds,
  context: CanvasRenderingContext2D,
) => drawGridLayer(
  context,
  plane,
  {
    startX: bounds.x,
    endX: bounds.x + bounds.width - 1,
    startY: bounds.y,
    endY: bounds.y + bounds.height - 1,
  },
  1,
  { x: 0, y: 0 },
);

const verifyWorkload = (workload: Workload) => {
  const plane = new CellPlaneIndex(workload.operations);
  const cold = project(plane, workload.bounds);
  const hot = project(plane, workload.bounds);
  expect(hot).toEqual(cold);
  expect(cold.count).toBeGreaterThan(0);
  plane.append(workload.invalidation);
  project(plane, workload.bounds);
  plane.dispose();
  return cold;
};

const measureWorkload = (
  workload: Workload,
  measuredRuns: number,
  hotProjectionRepeats: number,
  hotRenderRepeats: number,
) => {
  const samples = Object.fromEntries(
    CELL_PLANE_PHASES.map((phase) => [phase, [] as number[]]),
  ) as Record<CellPlanePhase, number[]>;
  let projectedCellCount = 0;
  let projectionChecksum = 0;
  let renderedCellCount = 0;
  let renderedGlyphCount = 0;
  let fillTextCalls = 0;
  let invalidatedRenderedCellCount = 0;
  let invalidatedRenderedGlyphCount = 0;
  let invalidatedFillTextCalls = 0;
  let chunkCount = 0;
  let encodedPayloadBytes = 0;
  let residentBytes = 0;
  let totalResidentBytes = 0;

  for (let run = 0; run < measuredRuns; run += 1) {
    let started = performance.now();
    const plane = new CellPlaneIndex(workload.operations);
    samples.construct.push(performance.now() - started);

    started = performance.now();
    const cold = project(plane, workload.bounds);
    samples.coldProjection.push(performance.now() - started);

    started = performance.now();
    for (let repeat = 0; repeat < hotProjectionRepeats; repeat += 1) {
      project(plane, workload.bounds);
    }
    samples.hotProjection.push(
      (performance.now() - started) / hotProjectionRepeats,
    );

    const renderProbe = createRenderProbe();
    render(plane, workload.bounds, renderProbe.context);
    renderProbe.reset();
    let rendered = { cells: 0, glyphs: 0 };
    started = performance.now();
    for (let repeat = 0; repeat < hotRenderRepeats; repeat += 1) {
      rendered = render(plane, workload.bounds, renderProbe.context);
    }
    samples.hotRenderPreparation.push(
      (performance.now() - started) / hotRenderRepeats,
    );
    renderedCellCount = rendered.cells;
    renderedGlyphCount = rendered.glyphs;
    fillTextCalls = renderProbe.getFillTextCalls() / hotRenderRepeats;
    digestSink ^= renderedCellCount ^ renderedGlyphCount ^ fillTextCalls;

    const stats = plane.getStats();
    projectedCellCount = cold.count;
    projectionChecksum = cold.checksum;
    chunkCount = stats.cachedChunks;
    encodedPayloadBytes = stats.encodedPayloadBytes;
    residentBytes = stats.residentBytes;
    totalResidentBytes =
      stats.residentBytes +
      ((stats as Record<string, number>).preparedTextBytes ?? 0);

    started = performance.now();
    plane.append(workload.invalidation);
    samples.append.push(performance.now() - started);

    started = performance.now();
    project(plane, workload.bounds);
    samples.invalidatedProjection.push(performance.now() - started);

    renderProbe.reset();
    started = performance.now();
    const invalidatedRendered = render(
      plane,
      workload.bounds,
      renderProbe.context,
    );
    samples.invalidatedRenderPreparation.push(performance.now() - started);
    invalidatedRenderedCellCount = invalidatedRendered.cells;
    invalidatedRenderedGlyphCount = invalidatedRendered.glyphs;
    invalidatedFillTextCalls = renderProbe.getFillTextCalls();
    digestSink ^=
      invalidatedRenderedCellCount ^
      invalidatedRenderedGlyphCount ^
      invalidatedFillTextCalls;

    plane.dispose();
  }

  return {
    projectedCellCount,
    projectionChecksum,
    renderedCellCount,
    renderedGlyphCount,
    fillTextCalls,
    invalidatedRenderedCellCount,
    invalidatedRenderedGlyphCount,
    invalidatedFillTextCalls,
    chunkCount,
    encodedPayloadBytes,
    residentBytes,
    totalResidentBytes,
    phases: Object.fromEntries(
      CELL_PLANE_PHASES.map((phase) => [phase, summarize(samples[phase])]),
    ) as CellPlaneBenchmarkResult["workloads"][number]["phases"],
  };
};

test("measures CellPlane phase costs", async () => {
  const warmupRuns = positiveInteger(process.env.CHARDESK_ENGINE_PERF_WARMUPS, DEFAULT_WARMUP_RUNS);
  const measuredRuns = positiveInteger(process.env.CHARDESK_ENGINE_PERF_RUNS, DEFAULT_MEASURED_RUNS);
  const hotProjectionRepeats = positiveInteger(
    process.env.CHARDESK_ENGINE_PERF_HOT_REPEATS,
    DEFAULT_HOT_PROJECTION_REPEATS,
  );
  const hotRenderRepeats = positiveInteger(
    process.env.CHARDESK_ENGINE_PERF_RENDER_REPEATS,
    DEFAULT_HOT_RENDER_REPEATS,
  );
  const workloads = makeWorkloads();

  for (const workload of workloads) {
    verifyWorkload(workload);
    measureWorkload(workload, warmupRuns, hotProjectionRepeats, hotRenderRepeats);
  }

  const result: CellPlaneBenchmarkResult = {
    schemaVersion: CELL_PLANE_BENCHMARK_SCHEMA,
    generatedAt: new Date().toISOString(),
    ...(process.env.CHARDESK_ENGINE_PERF_LABEL
      ? { label: process.env.CHARDESK_ENGINE_PERF_LABEL }
      : {}),
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    gitDirty: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpuCount: os.cpus().length,
    },
    settings: {
      warmupRuns,
      measuredRuns,
      hotProjectionRepeats,
      hotRenderRepeats,
    },
    workloads: workloads.map((workload) => ({
      id: workload.id,
      label: workload.label,
      description: workload.description,
      operationCount: workload.operations.length,
      sourceCellCount: workload.sourceCellCount,
      ...measureWorkload(
        workload,
        measuredRuns,
        hotProjectionRepeats,
        hotRenderRepeats,
      ),
    })),
  };

  const reportDirectory = path.resolve(
    process.env.CHARDESK_ENGINE_PERF_REPORT_DIR ?? "test-results/cell-plane-benchmark",
  );
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportDirectory, "report.json"), `${JSON.stringify(result, null, 2)}\n`),
    writeFile(path.join(reportDirectory, "report.md"), formatCellPlaneBenchmarkMarkdown(result)),
  ]);

  expect(result.workloads).toHaveLength(workloads.length);
  expect(digestSink).toBeTypeOf("number");
});
