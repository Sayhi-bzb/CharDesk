import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CANVAS_STRESS_THRESHOLDS,
  createCanvasStressMarkdown,
  evaluateCanvasStressLevel,
  type CanvasStressLevel,
  type CanvasStressMetrics,
  type CanvasStressReport,
} from "../../scripts/performance/canvas-stress-support";

type GridCell = {
  char: string;
  color: string;
  bgColor?: string;
  attrs?: { bold?: true; italic?: true; underline?: true };
};

type GridEntry = [string, GridCell];

type StructuredNode = Record<string, unknown>;

type BrowserProbe = {
  frames: number[];
  longTasks: number[];
  longAnimationFrames: Array<{ duration: number; blockingDuration: number }>;
  inputPaint: number[];
  rafId: number;
  observers: PerformanceObserver[];
};

type StorageProbe = {
  mode: "virtual" | "real";
  seedError: string | null;
  error: string | null;
  lastWriteAt: number;
  lastWriteDurationMs: number;
  lastBytes: number;
  writes: number;
};

declare global {
  interface Window {
    __canvasStressProbe?: BrowserProbe;
    __canvasStressStorage?: StorageProbe;
    __chardeskCanvasStress?: {
      ready: () => Promise<void>;
      flush: () => Promise<void>;
      switchSession: (id: string) => Promise<boolean>;
      removeSession: (id: string) => Promise<boolean>;
      sessionIds: () => string[];
      activeSessionId: () => string;
      setProjectionCacheBudget: (bytes: number) => void;
      loadSession: (snapshot: {
        mode: "freeform" | "structured";
        grid: GridEntry[];
        scene: [];
        components: [];
      }) => string;
      generateHistory: (operationCount: number) => void;
      cellCount: () => number;
      surfaceStats: () => Record<string, number> | null;
      memoryStats: () => Record<string, number>;
      resourceStats: () => Record<string, number | boolean | string> | null;
      persistence: () => { error: string | null };
    };
  }
}

const STORAGE_KEY = "chardesk-persistence";
const ONBOARDING_KEY = "chardesk-onboarding-v1";
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const SCENARIO_MS = 5_000;
const INPUT_FRAME_MS = 16;
const GRID_LEVELS = [5_000, 10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 250_000];
const UNICODE_GRID_LEVELS = [5_000, 10_000, 25_000, 50_000];
const HISTORY_LEVELS = [250, 1_000, 2_500];
const STRUCTURED_LEVELS = [100, 250, 500, 1_000, 2_000, 5_000];
const PERSISTENCE_LEVELS = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 250_000];
const ZOOM_LEVELS = [1, 0.5, 0.25];
const REPORT_DIR = process.env.CANVAS_STRESS_REPORT_DIR ?? path.join(
  process.cwd(),
  "test-results",
  "canvas-stress"
);
const CAPTURE_CPU_PROFILE = process.env.CANVAS_STRESS_CPU_PROFILE === "1";
const INPUT_COMMIT_CADENCE = ["frame", "32", "50", "80"].includes(
  process.env.CANVAS_STRESS_INPUT_COMMIT_MS ?? ""
)
  ? process.env.CANVAS_STRESS_INPUT_COMMIT_MS
  : "frame";

const report: CanvasStressReport = {
  generatedAt: new Date().toISOString(),
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
  thresholds: CANVAS_STRESS_THRESHOLDS,
  completedFamilies: [],
  levels: [],
};

const key = (x: number, y: number) => `${x},${y}`;

const formatLevel = (value: number) =>
  value >= 1_000 ? `${value / 1_000}k` : String(value);

const makeCell = (index: number): GridCell => {
  const chars = "CHARDESK";
  const colors = ["#111827", "#1d4ed8", "#0f766e", "#7c3aed"];
  const attrs = index % 29 === 0
    ? { bold: true as const }
    : index % 31 === 0
      ? { italic: true as const }
      : index % 37 === 0
        ? { underline: true as const }
        : undefined;
  return {
    char: chars[index % chars.length]!,
    color: colors[index % colors.length]!,
    ...(index % 11 === 0 ? { bgColor: index % 2 ? "#dbeafe" : "#fef3c7" } : {}),
    ...(attrs ? { attrs } : {}),
  };
};

const makeGrid = (count: number, density: "sparse" | "dense"): GridEntry[] => {
  const spacing = density === "sparse" ? 5 : 1;
  const area = count * spacing;
  const width = Math.max(1, Math.ceil(Math.sqrt(area * 2)));
  return Array.from({ length: count }, (_, index) => {
    const slot = index * spacing;
    return [key(slot % width, Math.floor(slot / width)), makeCell(index)];
  });
};

const makeUnicodeGrid = (count: number): GridEntry[] => {
  const chars = ["你", "👩🏽‍💻", "é", "A"] as const;
  const widths = [2, 2, 1, 1] as const;
  const rowWidth = Math.max(16, Math.ceil(Math.sqrt(count * 4)));
  const entries: GridEntry[] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < count; index += 1) {
    const charIndex = index % chars.length;
    const width = widths[charIndex]!;
    if (x + width > rowWidth) {
      x = 0;
      y += 1;
    }
    entries.push([key(x, y), { char: chars[charIndex]!, color: "#1d4ed8" }]);
    x += width;
  }
  return entries;
};

const makeStructuredScene = (nodeCount: number): StructuredNode[] => {
  const scene: StructuredNode[] = [];
  let order = 1;
  for (let index = 0; scene.length < nodeCount; index += 1) {
    const x = 4 + (index % 32) * 26;
    const y = 4 + Math.floor(index / 32) * 8;
    scene.push({
      id: `bg-${index}`,
      type: "bg",
      order: order++,
      start: { x, y },
      end: { x: x + 21, y: y + 5 },
      style: { color: "#111827", bgColor: index % 2 ? "#fef3c7" : "#dbeafe" },
    });
    if (scene.length >= nodeCount) break;
    scene.push({
      id: `box-${index}`,
      type: "box",
      order: order++,
      start: { x, y },
      end: { x: x + 21, y: y + 5 },
      name: `CARD ${index}`,
      style: { color: "#111827" },
    });
    if (scene.length >= nodeCount) break;
    scene.push({
      id: `text-${index}`,
      type: "text",
      order: order++,
      position: { x: x + 2, y: y + 2 },
      text: `Metric ${index}\nBUTTON`,
      style: { color: index % 2 ? "#0f766e" : "#1d4ed8" },
    });
  }
  return scene;
};

const makePersistedState = ({
  grid = [],
  scene = [],
  mode = "freeform",
  zoom = 1,
}: {
  grid?: GridEntry[];
  scene?: StructuredNode[];
  mode?: "freeform" | "structured";
  zoom?: number;
}) => {
  const session = {
    id: "stress-session",
    name: "Canvas Stress",
    mode,
    scene,
    components: [],
    grid: mode === "freeform" ? grid : [],
    viewport: { offset: { x: 128, y: 128 }, zoom },
  };
  return {
    state: {
      schemaVersion: 6,
      workspace: {
        offset: session.viewport.offset,
        zoom,
        canvasMode: mode,
        grid: mode === "freeform" ? grid : [],
        structuredScene: scene,
        structuredComponents: [],
      },
      sessions: { items: [session], activeId: session.id },
      preferences: {
        brushChar: "█",
        brushColor: "#111827",
        brushBackgroundColor: "#000000",
        showGrid: true,
        exportShowGrid: false,
      },
    },
    version: 6,
  };
};

const makeResidencyState = () => {
  const sessionIds = ["residency-a", "residency-b", "residency-c", "residency-d"];
  const grids = sessionIds.map((_, index) => makeGrid(5_000 + index * 250, "dense"));
  const result = makePersistedState({ grid: grids[0] });
  result.state.sessions = {
    activeId: sessionIds[0]!,
    items: sessionIds.map((id, index) => ({
      id,
      name: `Residency ${index + 1}`,
      mode: "freeform" as const,
      scene: [],
      components: [],
      grid: grids[index]!,
      viewport: { offset: { x: 128, y: 128 }, zoom: 1 },
    })),
  };
  return { snapshot: result, sessionIds };
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const installVirtualStorage = async (page: Page, serialized: string) => {
  await page.addInitScript(({ storageKey, onboardingKey, initialValue }) => {
    const values = new Map<string, string>([
      [storageKey, initialValue],
      [onboardingKey, "dismissed"],
    ]);
    const probe: StorageProbe = {
      mode: "virtual",
      seedError: null,
      error: null,
      lastWriteAt: 0,
      lastWriteDurationMs: 0,
      lastBytes: initialValue.length,
      writes: 0,
    };
    window.__canvasStressStorage = probe;
    Object.defineProperties(Storage.prototype, {
      getItem: {
        configurable: true,
        value(name: string) {
          return values.get(String(name)) ?? null;
        },
      },
      setItem: {
        configurable: true,
        value(name: string, value: string) {
          const startedAt = performance.now();
          const normalizedName = String(name);
          const normalizedValue = String(value);
          values.set(normalizedName, normalizedValue);
          if (normalizedName === storageKey) {
            probe.lastWriteAt = performance.now();
            probe.lastWriteDurationMs = probe.lastWriteAt - startedAt;
            probe.lastBytes = normalizedValue.length;
            probe.writes += 1;
          }
        },
      },
      removeItem: {
        configurable: true,
        value(name: string) {
          values.delete(String(name));
        },
      },
      clear: {
        configurable: true,
        value() {
          values.clear();
        },
      },
      key: {
        configurable: true,
        value(index: number) {
          return [...values.keys()][index] ?? null;
        },
      },
    });
  }, { storageKey: STORAGE_KEY, onboardingKey: ONBOARDING_KEY, initialValue: serialized });
};

const installRealStorage = async (page: Page, serialized: string) => {
  await page.addInitScript(({ storageKey, onboardingKey, initialValue }) => {
    const probe: StorageProbe = {
      mode: "real",
      seedError: null,
      error: null,
      lastWriteAt: 0,
      lastWriteDurationMs: 0,
      lastBytes: initialValue.length,
      writes: 0,
    };
    window.__canvasStressStorage = probe;
    const originalSetItem = Storage.prototype.setItem;
    try {
      localStorage.clear();
      originalSetItem.call(localStorage, onboardingKey, "dismissed");
      originalSetItem.call(localStorage, storageKey, initialValue);
    } catch (error) {
      probe.seedError = error instanceof Error ? error.message : String(error);
    }
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value(name: string, value: string) {
        const startedAt = performance.now();
        try {
          originalSetItem.call(this, name, value);
        } catch (error) {
          probe.error = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          if (String(name) === storageKey) {
            probe.lastWriteAt = performance.now();
            probe.lastWriteDurationMs = probe.lastWriteAt - startedAt;
            probe.lastBytes = String(value).length;
            probe.writes += 1;
          }
        }
      },
    });
  }, { storageKey: STORAGE_KEY, onboardingKey: ONBOARDING_KEY, initialValue: serialized });
};

const installFrameProbe = async (page: Page) => {
  await page.evaluate(() => {
    const probe: BrowserProbe = {
      frames: [],
      longTasks: [],
      longAnimationFrames: [],
      inputPaint: [],
      rafId: 0,
      observers: [],
    };
    let previousFrame = performance.now();
    const tick = (timestamp: number) => {
      probe.frames.push(timestamp - previousFrame);
      previousFrame = timestamp;
      probe.rafId = requestAnimationFrame(tick);
    };
    document.addEventListener("keydown", () => {
      const startedAt = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        probe.inputPaint.push(performance.now() - startedAt);
      }));
    }, { capture: true });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => probe.longTasks.push(entry.duration));
      });
      observer.observe({ type: "longtask", buffered: false });
      probe.observers.push(observer);
    }
    if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const frame = entry as PerformanceEntry & { blockingDuration?: number };
          probe.longAnimationFrames.push({
            duration: frame.duration,
            blockingDuration: frame.blockingDuration ?? 0,
          });
        });
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
      probe.observers.push(observer);
    }
    probe.rafId = requestAnimationFrame(tick);
    window.__canvasStressProbe = probe;
  });
};

const readFrameProbe = async (page: Page): Promise<CanvasStressMetrics> =>
  page.evaluate(() => {
    const probe = window.__canvasStressProbe!;
    cancelAnimationFrame(probe.rafId);
    probe.observers.forEach((observer) => observer.disconnect());
    const frames = probe.frames.slice(1);
    const sorted = [...frames].sort((left, right) => left - right);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
    const performanceWithMemory = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    const storage = window.__canvasStressStorage;
    return {
      frameCount: frames.length,
      avgFrameMs: frames.reduce((sum, value) => sum + value, 0) / Math.max(frames.length, 1),
      p95FrameMs: sorted.length ? sorted[p95Index]! : 0,
      p99FrameMs: sorted.length ? sorted[p99Index]! : 0,
      maxFrameMs: Math.max(0, ...frames),
      over32ms: frames.filter((value) => value > 32).length,
      over50ms: frames.filter((value) => value > 50).length,
      longTaskCount: probe.longTasks.length,
      maxLongTaskMs: Math.max(0, ...probe.longTasks),
      longAnimationFrameCount: probe.longAnimationFrames.length,
      maxLongAnimationFrameMs: Math.max(
        0,
        ...probe.longAnimationFrames.map((frame) => frame.duration)
      ),
      maxBlockingDurationMs: Math.max(
        0,
        ...probe.longAnimationFrames.map((frame) => frame.blockingDuration)
      ),
      inputPaintMs: probe.inputPaint.length
        ? [...probe.inputPaint].sort((left, right) => left - right)[
            Math.min(probe.inputPaint.length - 1, Math.floor(probe.inputPaint.length * 0.95))
          ]!
        : null,
      coldInputPaintMs: probe.inputPaint[0] ?? null,
      jsHeapBytes: performanceWithMemory.memory?.usedJSHeapSize ?? null,
      canvasBackingBytes: Array.from(document.querySelectorAll("canvas")).reduce(
        (sum, canvas) => sum + canvas.width * canvas.height * 4,
        0
      ),
      localStorageBytes: storage?.lastBytes ?? 0,
    };
  });

const dragFor = async (page: Page, durationMs = SCENARIO_MS) => {
  const surface = page.getByTestId("canvas-editor-surface");
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error("Canvas surface has no bounding box");
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.click(start.x, start.y);
  for (let sample = 0; sample < 21; sample += 1) {
    await page.keyboard.press("x");
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => {
    const probe = window.__canvasStressProbe;
    if (!probe) return;
    probe.frames = [];
    probe.longTasks = [];
    probe.longAnimationFrames = [];
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < durationMs) {
    await page.mouse.move(
      start.x + Math.sin(step / 13) * 240,
      start.y + Math.cos(step / 17) * 110
    );
    step += 1;
    await page.waitForTimeout(INPUT_FRAME_MS);
  }
  await page.mouse.up({ button: "middle" });
};

const readProjectedCellCount = async (page: Page) =>
  page.evaluate(async () => {
    const diagnostics = window.__chardeskCanvasStress;
    if (!diagnostics) throw new Error("Canvas stress diagnostics unavailable");
    await diagnostics.ready();
    return diagnostics.cellCount();
  });

const runLevel = async ({
  browser,
  family,
  label,
  snapshot,
  zoom,
  cellCount,
  nodeCount,
  storageMode = "virtual",
  readProjection = false,
  verifyReload = false,
  switchSessionIds,
  historyOperationCount,
}: {
  browser: Browser;
  family: CanvasStressLevel["family"];
  label: string;
  snapshot: unknown;
  zoom: number;
  cellCount?: number;
  nodeCount?: number;
  storageMode?: StorageProbe["mode"];
  readProjection?: boolean;
  verifyReload?: boolean;
  switchSessionIds?: readonly string[];
  historyOperationCount?: number;
}): Promise<CanvasStressLevel> => {
  const serialized = JSON.stringify(snapshot);
  const runtimeErrors: string[] = [];
  let metrics: CanvasStressMetrics | null = null;
  let storageError: string | null = null;
  let persistenceMs: number | null = null;
  let projectedCellCount: number | null = null;
  let surfaceStats: Record<string, number> | null = null;
  let memoryStats: Record<string, number> | null = null;
  let resourceStats: Record<string, number | boolean | string> | null = null;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  try {
    if (storageMode === "virtual") await installVirtualStorage(page, serialized);
    else await installRealStorage(page, serialized);
    await page.goto(
      `/?canvas-stress=1&canvas-stress-input-commit-ms=${INPUT_COMMIT_CADENCE}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    const seedError = await page.evaluate(() => window.__canvasStressStorage?.seedError ?? null);
    if (seedError) {
      storageError = seedError;
    } else {
      await page.locator("canvas").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const storage = window.__canvasStressStorage;
        if (!storage) return;
        storage.lastWriteAt = 0;
        storage.lastWriteDurationMs = 0;
        storage.error = null;
        storage.writes = 0;
      });
      if (historyOperationCount) {
        const surface = page.getByTestId("canvas-editor-surface");
        const bounds = await surface.boundingBox();
        if (!bounds) throw new Error("Canvas surface has no bounding box");
        await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.keyboard.type("x".repeat(historyOperationCount));
        await page.evaluate(async () => {
          const diagnostics = window.__chardeskCanvasStress;
          if (!diagnostics) throw new Error("Canvas stress diagnostics unavailable");
          await diagnostics.ready();
        });
      }
      await installFrameProbe(page);
      const diagnosticsSession = await context.newCDPSession(page);
      if (CAPTURE_CPU_PROFILE) {
        await diagnosticsSession.send("Profiler.enable");
        await diagnosticsSession.send("Profiler.start");
      }
      const interactionStartedAt = await page.evaluate(() => performance.now());
      if (switchSessionIds?.length) {
        await page.evaluate(async (ids) => {
          const diagnostics = window.__chardeskCanvasStress;
          if (!diagnostics) throw new Error("Canvas stress diagnostics unavailable");
          for (let index = 0; index < 24; index += 1) {
            await diagnostics.switchSession(ids[index % ids.length]!);
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }, switchSessionIds);
      }
      await dragFor(page);
      await page.waitForTimeout(300);
      if (CAPTURE_CPU_PROFILE) {
        const { profile } = await diagnosticsSession.send("Profiler.stop");
        await mkdir(REPORT_DIR, { recursive: true });
        await writeFile(
          path.join(REPORT_DIR, `${family}-${label.replaceAll(" ", "-")}.cpuprofile`),
          JSON.stringify(profile),
          "utf8"
        );
      }
      metrics = await readFrameProbe(page);
      await diagnosticsSession.send("HeapProfiler.collectGarbage");
      const heapAfterGc = await page.evaluate(() => {
        const measured = performance as Performance & {
          memory?: { usedJSHeapSize: number };
        };
        return measured.memory?.usedJSHeapSize ?? null;
      });
      metrics = {
        ...metrics,
        jsHeapBeforeGcBytes: metrics.jsHeapBytes,
        jsHeapBytes: heapAfterGc,
      };
      surfaceStats = await page.evaluate(
        () => window.__chardeskCanvasStress?.surfaceStats() ?? null
      );
      memoryStats = await page.evaluate(
        () => window.__chardeskCanvasStress?.memoryStats() ?? null
      );
      resourceStats = await page.evaluate(
        () => window.__chardeskCanvasStress?.resourceStats() ?? null
      );
      if (
        historyOperationCount &&
        (Number(resourceStats?.managedInputTextLength) || 0) < historyOperationCount
      ) {
        runtimeErrors.push(
          `managed input length ${resourceStats?.managedInputTextLength ?? 0} did not reach ${historyOperationCount}`
        );
      }
      await page.waitForTimeout(650);
      const storageProbe = await page.evaluate(() => window.__canvasStressStorage ?? null);
      storageError = storageProbe?.error ?? null;
      persistenceMs = storageProbe?.lastWriteAt
        ? storageProbe.lastWriteAt - interactionStartedAt
        : null;
      if (readProjection) projectedCellCount = await readProjectedCellCount(page);
      if (verifyReload) {
        const saved = await page.evaluate<{
          duration: number;
          count: number;
          persistence: { error: string | null };
        }>(async () => {
          const diagnostics = window.__chardeskCanvasStress;
          if (!diagnostics) throw new Error("Canvas stress diagnostics unavailable");
          await diagnostics.ready();
          const startedAt = performance.now();
          await diagnostics.flush();
          return {
            duration: performance.now() - startedAt,
            count: diagnostics.cellCount(),
            persistence: diagnostics.persistence(),
          };
        });
        persistenceMs = saved.duration;
        storageError = saved.persistence.error;
        if (saved.count !== cellCount) {
          runtimeErrors.push(`pre-reload cell count ${saved.count} did not match ${cellCount}`);
        }
        await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.locator("canvas").first().waitFor({ timeout: 120_000 });
        const restored = await page.evaluate<{
          count: number;
          persistence: { error: string | null };
        }>(async () => {
          const diagnostics = window.__chardeskCanvasStress;
          if (!diagnostics) throw new Error("Canvas stress diagnostics unavailable");
          await diagnostics.ready();
          return {
            count: diagnostics.cellCount(),
            persistence: diagnostics.persistence(),
          };
        });
        storageError = restored.persistence.error;
        if (restored.count !== cellCount) {
          runtimeErrors.push(`restored cell count ${restored.count} did not match ${cellCount}`);
        }
      }
    }
  } catch (error) {
    runtimeErrors.push(describeError(error));
  } finally {
    await context.close().catch(() => undefined);
  }

  const evaluatedFailures = evaluateCanvasStressLevel({
    metrics,
    runtimeErrors,
    storageError,
    resourceStats: resourceStats ?? undefined,
  });
  const failures = verifyReload
    ? evaluatedFailures.filter((failure) =>
        failure === "metrics-unavailable" ||
        failure === "runtime-error" ||
        failure === "storage-error"
      )
    : evaluatedFailures;
  return {
    family,
    label,
    zoom,
    snapshotBytes: Buffer.byteLength(serialized),
    ...(cellCount === undefined ? {} : { cellCount }),
    ...(nodeCount === undefined ? {} : { nodeCount }),
    ...(surfaceStats?.operationCount === undefined
      ? {}
      : { operationCount: surfaceStats.operationCount }),
    ...(readProjection ? { projectedCellCount } : {}),
    ...(surfaceStats ? { surfaceStats } : {}),
    ...(memoryStats ? { memoryStats } : {}),
    ...(resourceStats ? { resourceStats } : {}),
    ...(storageMode === "real" || verifyReload ? { persistenceMs, storageError } : {}),
    runtimeErrors,
    metrics,
    passed: failures.length === 0,
    failures,
  };
};

const appendLevel = (level: CanvasStressLevel) => {
  report.levels.push(level);
  const p95 = level.metrics ? `${level.metrics.p95FrameMs.toFixed(1)}ms` : "n/a";
  console.log(`[stress] ${level.family} ${level.label}: ${level.passed ? "PASS" : "FAIL"} p95=${p95} ${level.failures.join(",")}`);
};

const lastPassingCount = (family: CanvasStressLevel["family"]) =>
  [...report.levels]
    .reverse()
    .find((level) => level.family === family && level.passed)?.cellCount ?? null;

const markFamilyComplete = (family: CanvasStressLevel["family"]) => {
  if (!report.completedFamilies.includes(family)) report.completedFamilies.push(family);
};

test.describe.serial("Canvas capacity stress", () => {
  test.afterAll(async () => {
    await mkdir(REPORT_DIR, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(REPORT_DIR, "report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8"
      ),
      writeFile(
        path.join(REPORT_DIR, "report.md"),
        createCanvasStressMarkdown(report),
        "utf8"
      ),
    ]);
  });

  for (const density of ["sparse", "dense"] as const) {
    test(`finds the ${density} freeform boundary`, async ({ browser }) => {
      for (const cellCount of GRID_LEVELS) {
        const grid = makeGrid(cellCount, density);
        const level = await runLevel({
          browser,
          family: `freeform-${density}`,
          label: `${formatLevel(cellCount)} cells`,
          snapshot: makePersistedState({ grid }),
          zoom: 1,
          cellCount,
        });
        appendLevel(level);
        if (!level.passed) break;
      }
      markFamilyComplete(`freeform-${density}`);
      expect(lastPassingCount(`freeform-${density}`)).toBeGreaterThanOrEqual(5_000);
    });
  }

  test("finds the mixed-Unicode freeform boundary", async ({ browser }) => {
    for (const cellCount of UNICODE_GRID_LEVELS) {
      const grid = makeUnicodeGrid(cellCount);
      const level = await runLevel({
        browser,
        family: "freeform-unicode",
        label: `${formatLevel(cellCount)} Unicode anchors`,
        snapshot: makePersistedState({ grid }),
        zoom: 1,
        cellCount,
      });
      appendLevel(level);
      expect(level.surfaceStats).toMatchObject({
        preparedTextEntries: expect.any(Number),
        preparedTextHits: expect.any(Number),
      });
      expect(level.surfaceStats?.preparedTextEntries ?? 0).toBeGreaterThan(0);
      expect(level.surfaceStats?.preparedTextHits ?? 0).toBeGreaterThan(0);
      if (!level.passed) break;
    }
    markFamilyComplete("freeform-unicode");
    expect(lastPassingCount("freeform-unicode")).toBeGreaterThanOrEqual(5_000);
  });

  test("measures projection with deep freeform history", async ({ browser }) => {
    const cellCount = 10_000;
    const grid = makeGrid(cellCount, "dense");
    for (const historyOperationCount of HISTORY_LEVELS) {
      const level = await runLevel({
        browser,
        family: "freeform-history",
        label: `${formatLevel(historyOperationCount)} edits @ ${formatLevel(cellCount)} cells`,
        snapshot: makePersistedState({ grid }),
        zoom: 1,
        cellCount,
        historyOperationCount,
      });
      appendLevel(level);
      if (!level.passed) break;
    }
    markFamilyComplete("freeform-history");
    expect(report.levels.some((level) =>
      level.family === "freeform-history" && level.passed
    )).toBe(true);
  });

  test("finds the low-zoom viewport boundary", async ({ browser }) => {
    const cellCount = Math.min(lastPassingCount("freeform-dense") ?? 10_000, 10_000);
    const grid = makeGrid(cellCount, "dense");
    for (const zoom of ZOOM_LEVELS) {
      const level = await runLevel({
        browser,
        family: "zoom",
        label: `zoom ${zoom} @ ${formatLevel(cellCount)} cells`,
        snapshot: makePersistedState({ grid, zoom }),
        zoom,
        cellCount,
      });
      appendLevel(level);
    }
    markFamilyComplete("zoom");
    expect(report.levels.some((level) =>
      level.family === "zoom" && level.zoom === 0.25 && level.passed
    )).toBe(true);
  });

  test("finds the structured-node boundary", async ({ browser }) => {
    for (const nodeCount of STRUCTURED_LEVELS) {
      const scene = makeStructuredScene(nodeCount);
      const level = await runLevel({
        browser,
        family: "structured",
        label: `${formatLevel(nodeCount)} nodes`,
        snapshot: makePersistedState({ scene, mode: "structured" }),
        zoom: 1,
        nodeCount,
        readProjection: true,
      });
      appendLevel(level);
      if (!level.passed) break;
    }
    markFamilyComplete("structured");
    const lastPassingNodes = [...report.levels]
      .reverse()
      .find((level) => level.family === "structured" && level.passed)?.nodeCount ?? null;
    expect(lastPassingNodes).toBeGreaterThanOrEqual(1_000);
  });

  test("keeps resource residency bounded while switching canvases", async ({ browser }) => {
    const { snapshot, sessionIds } = makeResidencyState();
    const level = await runLevel({
      browser,
      family: "residency",
      label: "24 switches across 4 canvases",
      snapshot,
      zoom: 1,
      switchSessionIds: sessionIds,
    });
    appendLevel(level);
    markFamilyComplete("residency");
    expect(level.passed).toBe(true);
  });

  test("verifies the IndexedDB persistence boundary", async ({ browser }) => {
    for (const cellCount of PERSISTENCE_LEVELS) {
      const grid = makeGrid(cellCount, "dense");
      const level = await runLevel({
        browser,
        family: "persistence",
        label: `${formatLevel(cellCount)} active cells`,
        snapshot: makePersistedState({ grid }),
        zoom: 1,
        cellCount,
        verifyReload: true,
      });
      appendLevel(level);
      if (!level.passed) break;
    }
    markFamilyComplete("persistence");
    expect(lastPassingCount("persistence")).toBeGreaterThanOrEqual(100_000);
  });
});
