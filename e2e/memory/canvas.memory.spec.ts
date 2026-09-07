import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CANVAS_MEMORY_SCHEMA,
  CANVAS_MEMORY_THRESHOLDS,
  createCanvasMemoryMarkdown,
  evaluateCanvasMemoryRuns,
  type CanvasMemoryCheckpoint,
  type CanvasMemoryReport,
  type CanvasMemoryRun,
} from "../../scripts/performance/canvas-memory-support";

type GridCell = {
  char: string;
  color: string;
  bgColor?: string;
};
type GridEntry = [string, GridCell];
type SessionSnapshot = {
  mode: "freeform";
  grid: GridEntry[];
  scene: [];
  components: [];
};
type MemoryDiagnostics = {
  ready: () => Promise<void>;
  switchSession: (id: string) => Promise<boolean>;
  removeSession: (id: string) => Promise<boolean>;
  activeSessionId: () => string;
  setProjectionCacheBudget: (bytes: number) => void;
  loadSession: (snapshot: SessionSnapshot) => string;
  generateHistory: (operationCount: number) => void;
  memoryStats: () => Record<string, number>;
  renderStats: () => Record<string, number | null> | null;
};
type Workload = {
  id: string;
  label: string;
  description: string;
  grids: GridEntry[][];
  history?: { mode: "engine" | "managed-input"; operations: number };
  switches?: number;
  projectionBudgetBytes?: number;
  churn?: boolean;
};

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const requestedSampleIntervalMs = Number(
  process.env.CHARDESK_MEMORY_SAMPLE_MS ?? 20
);
const SAMPLE_INTERVAL_MS = Number.isFinite(requestedSampleIntervalMs)
  ? Math.max(10, requestedSampleIntervalMs)
  : 20;
const GC_PASSES = 2;
const MEASURED_RUNS = Math.max(1, Number(process.env.CHARDESK_MEMORY_RUNS ?? 5));
const WORKLOAD_FILTER = new Set(
  (process.env.CHARDESK_MEMORY_WORKLOADS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const REPORT_DIR = process.env.CANVAS_MEMORY_REPORT_DIR ?? path.join(
  process.cwd(),
  "test-results",
  "canvas-memory"
);
const RENDER_MODE = process.env.CHARDESK_MEMORY_RENDER_MODE === "off"
  ? "off"
  : "normal";
const INPUT_MODE = process.env.CHARDESK_MEMORY_INPUT_MODE === "inert"
  ? "inert"
  : process.env.CHARDESK_MEMORY_INPUT_MODE === "insert-text"
    ? "insert-text"
    : "canvas";
const ALLOCATION_SAMPLING = process.env.CHARDESK_MEMORY_ALLOCATIONS === "1";
const requestedInputDelayMs = Number(process.env.CHARDESK_MEMORY_INPUT_DELAY_MS ?? 0);
const INPUT_DELAY_MS = Number.isFinite(requestedInputDelayMs)
  ? Math.max(0, requestedInputDelayMs)
  : 0;
const requestedInputCommitCadence = process.env.CHARDESK_MEMORY_INPUT_COMMIT_MS;
const INPUT_COMMIT_CADENCE = requestedInputCommitCadence === "32"
  ? 32
  : requestedInputCommitCadence === "50"
    ? 50
    : requestedInputCommitCadence === "80"
      ? 80
      : "frame";

type AllocationProfileNode = {
  selfSize: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
  };
  children?: AllocationProfileNode[];
};

const summarizeAllocationProfile = (root: AllocationProfileNode) => {
  const totals = new Map<string, number>();
  const visit = (node: AllocationProfileNode) => {
    const frame = node.callFrame;
    const key = `${frame.url || "(native)"}:${frame.lineNumber + 1}:${frame.functionName || "(anonymous)"}`;
    totals.set(key, (totals.get(key) ?? 0) + node.selfSize);
    node.children?.forEach(visit);
  };
  visit(root);
  return [...totals]
    .map(([frame, bytes]) => ({ frame, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 30);
};

const renderCounters = (stats: Record<string, number | null> | null) => ({
  contentFrames: stats?.directFrames ?? 0,
  fullContentFrames: stats?.fullContentFrames ?? 0,
  partialContentFrames: stats?.partialContentFrames ?? 0,
  glyphs: stats?.totalDirectGlyphs ?? 0,
  dirtyCellArea: stats?.totalDirtyCellArea ?? 0,
});

const subtractRenderCounters = (
  after: ReturnType<typeof renderCounters>,
  before: ReturnType<typeof renderCounters>
) => ({
  contentFrames: after.contentFrames - before.contentFrames,
  fullContentFrames: after.fullContentFrames - before.fullContentFrames,
  partialContentFrames: after.partialContentFrames - before.partialContentFrames,
  glyphs: after.glyphs - before.glyphs,
  dirtyCellArea: after.dirtyCellArea - before.dirtyCellArea,
});

const inputCounters = (stats: Record<string, number | null> | null) => ({
  batches: stats?.managedInputBatches ?? 0,
  textLength: stats?.managedInputTextLength ?? 0,
  firstBatches: stats?.firstManagedInputBatches ?? 0,
  burstBatches: stats?.burstManagedInputBatches ?? 0,
  boundaryBatches: stats?.boundaryManagedInputBatches ?? 0,
  imeBatches: stats?.imeManagedInputBatches ?? 0,
  firstCommitP95Ms: stats?.firstManagedInputCommitP95Ms ?? 0,
  burstCommitP95Ms: stats?.burstManagedInputCommitP95Ms ?? 0,
  burstCommitMaxMs: stats?.burstManagedInputCommitMaxMs ?? 0,
});

const subtractInputCounters = (
  after: ReturnType<typeof inputCounters>,
  before: ReturnType<typeof inputCounters>
) => ({
  batches: after.batches - before.batches,
  textLength: after.textLength - before.textLength,
  firstBatches: after.firstBatches - before.firstBatches,
  burstBatches: after.burstBatches - before.burstBatches,
  boundaryBatches: after.boundaryBatches - before.boundaryBatches,
  imeBatches: after.imeBatches - before.imeBatches,
  firstCommitP95Ms: after.firstCommitP95Ms,
  burstCommitP95Ms: after.burstCommitP95Ms,
  burstCommitMaxMs: after.burstCommitMaxMs,
});
const STORAGE_KEY = "chardesk-persistence";
const ONBOARDING_KEY = "chardesk-onboarding-v1";

const makeCell = (index: number): GridCell => ({
  char: "CHARDESK"[index % 8]!,
  color: ["#111827", "#1d4ed8", "#0f766e", "#7c3aed"][index % 4]!,
  ...(index % 11 === 0 ? { bgColor: "#dbeafe" } : {}),
});

const makeGrid = (count: number): GridEntry[] => {
  const width = Math.ceil(Math.sqrt(count * 2));
  return Array.from({ length: count }, (_, index) => [
    `${index % width},${Math.floor(index / width)}`,
    makeCell(index),
  ]);
};

const makeUnicodeGrid = (count: number): GridEntry[] => {
  const characters = ["你", "👩🏽‍💻", "é", "A"] as const;
  const widths = [2, 2, 1, 1] as const;
  const rowWidth = Math.max(16, Math.ceil(Math.sqrt(count * 4)));
  const entries: GridEntry[] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < count; index += 1) {
    const characterIndex = index % characters.length;
    const width = widths[characterIndex]!;
    if (x + width > rowWidth) {
      x = 0;
      y += 1;
    }
    entries.push([
      `${x},${y}`,
      { char: characters[characterIndex]!, color: "#1d4ed8" },
    ]);
    x += width;
  }
  return entries;
};

const snapshot = (grid: GridEntry[]): SessionSnapshot => ({
  mode: "freeform",
  grid,
  scene: [],
  components: [],
});

const blankPersistence = JSON.stringify({
  state: {
    schemaVersion: 5,
    workspace: {
      offset: { x: 128, y: 128 },
      zoom: 1,
      canvasMode: "freeform",
      grid: [],
      structuredScene: [],
      structuredComponents: [],
    },
    sessions: {
      items: [{
        id: "memory-baseline",
        name: "Memory baseline",
        mode: "freeform",
        scene: [],
        components: [],
        grid: [],
        viewport: { offset: { x: 128, y: 128 }, zoom: 1 },
      }],
      activeId: "memory-baseline",
    },
    preferences: {
      brushChar: "█",
      brushColor: "#111827",
      brushBackgroundColor: "#000000",
      showGrid: true,
      exportShowGrid: false,
    },
  },
  version: 5,
});

const workloads: Workload[] = [
  ...[5_000, 25_000, 50_000].map((count) => ({
    id: `ascii-${count}`,
    label: `ASCII ${count / 1_000}k`,
    description: `${count.toLocaleString()} ASCII cells`,
    grids: [makeGrid(count)],
  })),
  ...[5_000, 25_000, 50_000].map((count) => ({
    id: `unicode-${count}`,
    label: `Unicode ${count / 1_000}k`,
    description: `${count.toLocaleString()} mixed-width Unicode cells`,
    grids: [makeUnicodeGrid(count)],
  })),
  ...(["engine", "managed-input"] as const).flatMap((mode) =>
    [250, 1_000, 2_500].map((count) => ({
      id: `history-${mode}-${count}`,
      label: `History ${mode} ${count.toLocaleString()}`,
      description: `${count.toLocaleString()} ${mode} history operations`,
      grids: [makeGrid(5_000)],
      history: { mode, operations: count },
    }))
  ),
  {
    id: "residency-default",
    label: "Residency 4 documents",
    description: "Four 5k-cell documents switched 24 times",
    grids: [5_000, 5_250, 5_500, 5_750].map(makeGrid),
    switches: 24,
  },
  {
    id: "unicode-50000-budget-1m",
    label: "Unicode 50k / 1 MiB budget",
    description: "50k Unicode cells under a constrained projection budget",
    grids: [makeUnicodeGrid(50_000)],
    projectionBudgetBytes: 1024 * 1024,
  },
  {
    id: "lifecycle-churn",
    label: "Lifecycle churn",
    description: "Five sequential 10k-cell document load/release cycles",
    grids: Array.from({ length: 5 }, () => makeGrid(10_000)),
    churn: true,
  },
];
const selectedWorkloads = WORKLOAD_FILTER.size === 0
  ? workloads
  : workloads.filter(({ id }) => WORKLOAD_FILTER.has(id));

const diagnostics = (page: Page) => page.evaluateHandle(() => {
  const value = (window as Window & {
    __chardeskCanvasStress?: MemoryDiagnostics;
  }).__chardeskCanvasStress;
  if (!value) throw new Error("Canvas memory diagnostics unavailable");
  return value;
});

const installBlankStorage = async (page: Page) => {
  await page.addInitScript(({ storageKey, onboardingKey, initialValue }) => {
    const values = new Map<string, string>([
      [storageKey, initialValue],
      [onboardingKey, "dismissed"],
    ]);
    Object.defineProperties(Storage.prototype, {
      getItem: {
        configurable: true,
        value(name: string) { return values.get(String(name)) ?? null; },
      },
      setItem: {
        configurable: true,
        value(name: string, value: string) {
          values.set(String(name), String(value));
        },
      },
      removeItem: {
        configurable: true,
        value(name: string) { values.delete(String(name)); },
      },
      clear: {
        configurable: true,
        value() { values.clear(); },
      },
      key: {
        configurable: true,
        value(index: number) { return [...values.keys()][index] ?? null; },
      },
    });
  }, {
    storageKey: STORAGE_KEY,
    onboardingKey: ONBOARDING_KEY,
    initialValue: blankPersistence,
  });
};

const settle = async (page: Page) => {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.waitForTimeout(100);
};

const collectCheckpoint = async (
  page: Page,
  cdp: CDPSession,
  collectGarbage = true
): Promise<CanvasMemoryCheckpoint> => {
  await settle(page);
  if (collectGarbage) {
    for (let pass = 0; pass < GC_PASSES; pass += 1) {
      await cdp.send("HeapProfiler.collectGarbage");
      await settle(page);
    }
  }
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const browser = await page.evaluate(() => {
    const api = (window as Window & {
      __chardeskCanvasStress?: MemoryDiagnostics;
    }).__chardeskCanvasStress;
    if (!api) throw new Error("Canvas memory diagnostics unavailable");
    const canvasBackingBytes = [...document.querySelectorAll("canvas")]
      .reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0);
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    let liveDomNodes = 1;
    while (walker.nextNode()) liveDomNodes += 1;
    return { canvasBackingBytes, engine: api.memoryStats(), liveDomNodes };
  });
  return {
    heapUsedBytes: heap.usedSize,
    heapTotalBytes: heap.totalSize,
    embedderHeapUsedBytes: heap.embedderHeapUsedSize,
    backingStorageBytes: heap.backingStorageSize,
    documents: dom.documents,
    nodes: dom.nodes,
    liveDomNodes: browser.liveDomNodes,
    detachedDomNodesEstimate: Math.max(0, dom.nodes - browser.liveDomNodes),
    jsEventListeners: dom.jsEventListeners,
    canvasBackingBytes: browser.canvasBackingBytes,
    engine: browser.engine,
  };
};

const measurePeak = async (
  cdp: CDPSession,
  action: () => Promise<void>
) => {
  let running = true;
  let peak = 0;
  const sample = async () => {
    while (running) {
      const heap = await cdp.send("Runtime.getHeapUsage");
      peak = Math.max(peak, heap.usedSize);
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
  };
  const sampling = sample();
  try {
    await action();
  } finally {
    running = false;
    await sampling;
  }
  const finalHeap = await cdp.send("Runtime.getHeapUsage");
  return Math.max(peak, finalHeap.usedSize);
};

const panCanvas = async (page: Page) => {
  const surface = page.getByTestId("canvas-editor-surface");
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas surface has no bounding box");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "middle" });
  for (let step = 0; step < 20; step += 1) {
    await page.mouse.move(x + step * 8, y + Math.sin(step / 3) * 30);
    await page.waitForTimeout(10);
  }
  await page.mouse.up({ button: "middle" });
};

test("measures canvas memory lifecycle workloads", async ({ browser }) => {
  const measured = [];
  const allocationProfiles: Array<{
    workloadId: string;
    runIndex: number;
    topAllocations: ReturnType<typeof summarizeAllocationProfile>;
  }> = [];
  expect(selectedWorkloads.length, "No memory workloads matched CHARDESK_MEMORY_WORKLOADS")
    .toBeGreaterThan(0);
  for (const workload of selectedWorkloads) {
    const runs: CanvasMemoryRun[] = [];
    for (let runIndex = 0; runIndex < MEASURED_RUNS; runIndex += 1) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
      });
      const page = await context.newPage();
      try {
        await installBlankStorage(page);
        await page.goto(
          `/?canvas-stress=1&canvas-stress-input-commit-ms=${INPUT_COMMIT_CADENCE}${RENDER_MODE === "off" ? "&canvas-stress-render=off" : ""}`,
          {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          }
        );
        await page.locator("canvas").first().waitFor({ timeout: 30_000 });
        const handle = await diagnostics(page);
        await handle.evaluate((api) => api.ready());
        const cdp = await context.newCDPSession(page);
        await cdp.send("Runtime.enable");
        // Put the baseline on the same post-create/delete lifecycle state as the
        // released checkpoint. This excludes lazy session/UI initialization
        // from retention while leaving the measured payload cold.
        const warmupId = await handle.evaluate(
          (api, value) => api.loadSession(value),
          snapshot([])
        );
        await handle.evaluate((api) => api.ready());
        await handle.evaluate(
          (api, baselineId) => api.switchSession(baselineId),
          "memory-baseline"
        );
        await handle.evaluate((api, targetId) => api.removeSession(targetId), warmupId);
        await handle.evaluate((api) => api.ready());
        await panCanvas(page);
        const baselineAfterGc = await collectCheckpoint(page, cdp);
        if (workload.projectionBudgetBytes !== undefined) {
          await handle.evaluate(
            (api, bytes) => api.setProjectionCacheBudget(bytes),
            workload.projectionBudgetBytes
          );
        }

        const targetIds: string[] = [];
        const cycleRetainedHeapBytes: number[] = [];
        let loadedAfterGc: CanvasMemoryCheckpoint | null = null;
        const renderBefore = renderCounters(
          await handle.evaluate((api) => api.renderStats())
        );
        const inputBefore = inputCounters(
          await handle.evaluate((api) => api.renderStats())
        );
        if (ALLOCATION_SAMPLING) {
          await cdp.send("HeapProfiler.enable");
          await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32_768 });
        }
        const interactionPeakHeapBytes = await measurePeak(cdp, async () => {
          for (const grid of workload.grids) {
            const id = await handle.evaluate((api, value) => api.loadSession(value), snapshot(grid));
            targetIds.push(id);
            await handle.evaluate((api) => api.ready());
            if (workload.churn) {
              loadedAfterGc ??= await collectCheckpoint(page, cdp);
              await panCanvas(page);
              await handle.evaluate((api, baselineId) => api.switchSession(baselineId), "memory-baseline");
              await handle.evaluate((api, targetId) => api.removeSession(targetId), id);
              cycleRetainedHeapBytes.push((await collectCheckpoint(page, cdp)).heapUsedBytes);
            }
          }
          if (!workload.churn) {
            loadedAfterGc = await collectCheckpoint(page, cdp);
            if (workload.history?.mode === "engine") {
              await handle.evaluate(
                (api, count) => api.generateHistory(count),
                workload.history.operations
              );
              await handle.evaluate((api) => api.ready());
            } else if (workload.history?.mode === "managed-input") {
              if (INPUT_MODE === "inert") {
                await page.evaluate(() => {
                  const textarea = document.createElement("textarea");
                  textarea.dataset.memoryInputControl = "true";
                  textarea.style.position = "fixed";
                  textarea.style.inset = "0 auto auto 0";
                  textarea.addEventListener("input", () => { textarea.value = ""; });
                  document.body.append(textarea);
                  textarea.focus();
                });
                await page.keyboard.type("x".repeat(workload.history.operations), {
                  delay: INPUT_DELAY_MS,
                });
                await page.locator("[data-memory-input-control]").evaluate((node) => node.remove());
              } else {
                const surface = page.getByTestId("canvas-editor-surface");
                const bounds = await surface.boundingBox();
                if (!bounds) throw new Error("Canvas surface has no bounding box");
                await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                if (INPUT_MODE === "insert-text") {
                  await page.keyboard.insertText("x".repeat(workload.history.operations));
                } else {
                  await page.keyboard.type("x".repeat(workload.history.operations), {
                    delay: INPUT_DELAY_MS,
                  });
                }
              }
              await handle.evaluate((api) => api.ready());
            }
            if (workload.switches) {
              for (let index = 0; index < workload.switches; index += 1) {
                await handle.evaluate(
                  (api, id) => api.switchSession(id),
                  targetIds[index % targetIds.length]!
                );
              }
            }
            await panCanvas(page);
          }
        });
        if (ALLOCATION_SAMPLING) {
          const { profile } = await cdp.send("HeapProfiler.stopSampling");
          allocationProfiles.push({
            workloadId: workload.id,
            runIndex,
            topAllocations: summarizeAllocationProfile(
              profile.head as AllocationProfileNode
            ),
          });
        }

        loadedAfterGc ??= await collectCheckpoint(page, cdp);
        const renderAfter = renderCounters(
          await handle.evaluate((api) => api.renderStats())
        );
        const inputAfter = inputCounters(
          await handle.evaluate((api) => api.renderStats())
        );
        const retainedAfterGc = await collectCheckpoint(page, cdp);
        if (!workload.churn) {
          await handle.evaluate((api) => api.switchSession("memory-baseline"));
          for (const id of targetIds) {
            await handle.evaluate((api, targetId) => api.removeSession(targetId), id);
          }
        }
        const releasedAfterGc = await collectCheckpoint(page, cdp);
        if (cycleRetainedHeapBytes.length === 0) {
          cycleRetainedHeapBytes.push(releasedAfterGc.heapUsedBytes);
        }
        runs.push({
          checkpoints: {
            baselineAfterGc,
            loadedAfterGc,
            retainedAfterGc,
            releasedAfterGc,
          },
          interactionPeakHeapBytes,
          cycleRetainedHeapBytes,
          render: subtractRenderCounters(renderAfter, renderBefore),
          input: subtractInputCounters(inputAfter, inputBefore),
        });
      } finally {
        await context.close();
      }
    }
    const evaluation = evaluateCanvasMemoryRuns(runs);
    measured.push({
      id: workload.id,
      label: workload.label,
      description: workload.description,
      runs,
      summary: evaluation.summary,
      passed: evaluation.failures.length === 0,
      failures: evaluation.failures,
    });
  }

  const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const gitDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
  const report: CanvasMemoryReport = {
    schemaVersion: CANVAS_MEMORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    ...(process.env.CANVAS_MEMORY_LABEL ? { label: process.env.CANVAS_MEMORY_LABEL } : {}),
    gitCommit,
    gitDirty,
    scope: "page-engine",
    exclusions: ["worker heaps", "GPU allocations", "browser RSS"],
    environment: {
      platform: os.platform(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpuCount: os.cpus().length,
      node: process.version,
      browser: "Chromium",
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    },
    settings: {
      measuredRuns: MEASURED_RUNS,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      gcPasses: GC_PASSES,
      renderMode: RENDER_MODE,
      inputMode: INPUT_MODE,
      allocationSampling: ALLOCATION_SAMPLING,
      inputCommitCadenceMs: INPUT_COMMIT_CADENCE,
      inputDelayMs: INPUT_DELAY_MS,
    },
    thresholds: CANVAS_MEMORY_THRESHOLDS,
    workloads: measured,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(REPORT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(REPORT_DIR, "report.md"), createCanvasMemoryMarkdown(report), "utf8"),
    ...(ALLOCATION_SAMPLING
      ? [writeFile(
          path.join(REPORT_DIR, "allocations.json"),
          `${JSON.stringify(allocationProfiles, null, 2)}\n`,
          "utf8"
        )]
      : []),
  ]);

  const failures = measured.flatMap((workload) =>
    workload.failures.map((failure) => `${workload.id}: ${failure}`)
  );
  expect(failures, `Memory guard failures:\n${failures.join("\n")}`).toEqual([]);
});
