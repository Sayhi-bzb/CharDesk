import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { DEFAULT_CANVAS_CELL_METRICS } from "../src/shared/fonts/canvas-profile";

type GridCell = {
  char: string;
  color: string;
  bgColor?: string;
};

type GridEntry = [string, GridCell];

type SmoothMetrics = {
  name: string;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  over32ms: number;
  over50ms: number;
  longTaskCount: number;
  maxLongTaskMs: number;
};

const STORAGE_KEY = "chardesk-persistence";
const SCENARIO_MS = 5_000;
const INPUT_FRAME_MS = 16;
const LIMITS = {
  p95FrameMs: 24,
  maxOver50msFrames: 2,
};
type PerformanceCanvasMode = "freeform" | "structured" | "slide";

const key = (x: number, y: number) => `${x},${y}`;

const makeGrid = (width: number, height: number): GridEntry[] => {
  const chars = "CHARDESK PERF ";
  const entries: GridEntry[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isText = (x + y) % 5 === 0;
      const isBg = (x * 3 + y) % 11 === 0;
      if (!isText && !isBg) continue;

      entries.push([
        key(x, y),
        {
          char: isText ? chars[(x + y) % chars.length] : " ",
          color: "#111827",
          ...(isBg ? { bgColor: y % 2 ? "#dbeafe" : "#ecfeff" } : {}),
        },
      ]);
    }
  }

  return entries;
};

const makeStructuredScene = (nodeCount = 96) => {
  const scene: Array<Record<string, unknown>> = [];
  let order = 1;

  for (let i = 0; scene.length < nodeCount; i++) {
    const x = 4 + (i % 32) * 26;
    const y = 4 + Math.floor(i / 32) * 8;
    scene.push({
      id: `bg-${i}`,
      type: "bg",
      order: order++,
      start: { x, y },
      end: { x: x + 21, y: y + 5 },
      style: { color: "#111827", bgColor: i % 2 ? "#fef3c7" : "#dbeafe" },
    });
    if (scene.length >= nodeCount) break;
    scene.push({
      id: `box-${i}`,
      type: "box",
      order: order++,
      start: { x, y },
      end: { x: x + 21, y: y + 5 },
      name: `CARD ${i}`,
      style: { color: "#111827" },
    });
    if (scene.length >= nodeCount) break;
    scene.push({
      id: `text-${i}`,
      type: "text",
      order: order++,
      position: { x: x + 2, y: y + 2 },
      text: `Metric ${i}\nBUTTON`,
      style: { color: i % 2 ? "#0f766e" : "#1d4ed8" },
    });
  }

  return scene;
};

const makePersistedState = (
  mode: PerformanceCanvasMode,
  options: { structuredNodeCount?: number } = {}
) => {
  const freeformGrid = makeGrid(180, 90);
  const structuredScene = makeStructuredScene(options.structuredNodeCount);
  const grid = mode === "structured" ? [] : freeformGrid;
  const slideDeck = mode === "slide"
    ? {
        activeSlideId: "perf-slide",
        slides: [
          {
            id: "perf-slide",
            name: "Performance Slide",
            size: { columns: 180, rows: 90 },
            grid: freeformGrid,
          },
        ],
      }
    : null;
  const session = {
    id: "perf-session",
    name: "Performance Seed",
    mode,
    scene: mode === "structured" ? structuredScene : [],
    grid,
    ...(slideDeck ? { slideDeck } : {}),
    viewport: { offset: { x: 180, y: 130 }, zoom: 1 },
  };

  return {
    state: {
      offset: session.viewport.offset,
      zoom: session.viewport.zoom,
      canvasMode: mode,
      slideDeck,
      structuredScene: mode === "structured" ? structuredScene : [],
      brushChar: "█",
      brushColor: "#111827",
      showGrid: true,
      exportShowGrid: false,
      canvasSessions: [session],
      activeCanvasId: session.id,
      grid,
    },
    version: 0,
  };
};

const makeSessionSwitchPersistedState = () => {
  const freeformGrid = makeGrid(180, 90);
  const columns = 400;
  const rows = 150;
  const structuredGrid: GridEntry[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      structuredGrid.push([
        key(x, y),
        { char: " ", color: "#111", bgColor: "#def" },
      ]);
    }
  }
  const structuredScene = [
    {
      id: "large-background",
      type: "bg",
      order: 1,
      start: { x: 0, y: 0 },
      end: { x: columns - 1, y: rows - 1 },
      style: { color: "#111", bgColor: "#def" },
    },
  ];
  const sessions = [
    {
      id: "freeform-switch-source",
      name: "Free Canvas 2",
      mode: "freeform",
      scene: [],
      components: [],
      grid: freeformGrid,
      viewport: { offset: { x: 180, y: 130 }, zoom: 1 },
    },
    {
      id: "structured-switch-target",
      name: "Structured Canvas 1",
      mode: "structured",
      scene: structuredScene,
      components: [],
      grid: structuredGrid,
      viewport: { offset: { x: 180, y: 130 }, zoom: 1 },
    },
  ];

  return {
    state: {
      schemaVersion: 6,
      workspace: {
        offset: { x: 180, y: 130 },
        zoom: 1,
        canvasMode: "freeform",
        grid: freeformGrid,
        structuredScene: [],
        structuredComponents: [],
      },
      sessions: { items: sessions, activeId: sessions[0].id },
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

const seedCanvas = async (
  page: Page,
  mode: PerformanceCanvasMode,
  options: { structuredNodeCount?: number } = {}
) => {
  const persisted = makePersistedState(mode, options);
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: STORAGE_KEY, value: persisted }
  );
};

const seedSessionSwitch = async (page: Page) => {
  const persisted = makeSessionSwitchPersistedState();
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.localStorage.clear();
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: STORAGE_KEY, value: persisted }
  );
};

const openSeededCanvas = async (
  page: Page,
  mode: PerformanceCanvasMode,
  options: { structuredNodeCount?: number } = {}
) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
  });
  await seedCanvas(page, mode, options);
  await page.goto("/");
  await page.waitForSelector("canvas", { timeout: 10_000 }).catch((error) => {
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        ...runtimeErrors.map((message) => `runtime: ${message}`),
      ].join("\n")
    );
  });
  await page.waitForTimeout(250);
};

const installSmoothProbe = async (page: Page) => {
  await page.evaluate(() => {
    const state = {
      frames: [] as number[],
      longTasks: [] as number[],
      rafId: 0,
      observer: null as PerformanceObserver | null,
    };
    let last = performance.now();

    state.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks.push(entry.duration);
      }
    });
    try {
      state.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      state.observer = null;
    }

    const tick = (now: number) => {
      state.frames.push(now - last);
      last = now;
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
    window.__asciiPerf = state;
  });
};

const readSmoothProbe = async (page: Page, name: string): Promise<SmoothMetrics> =>
  page.evaluate((scenarioName) => {
    const state = window.__asciiPerf;
    cancelAnimationFrame(state.rafId);
    state.observer?.disconnect();
    const frames = state.frames.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const percentile = (p: number) =>
      sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
        : 0;
    const longTasks = state.longTasks;

    return {
      name: scenarioName,
      frameCount: frames.length,
      avgFrameMs:
        frames.reduce((sum, value) => sum + value, 0) /
        Math.max(frames.length, 1),
      p95FrameMs: percentile(0.95),
      maxFrameMs: Math.max(0, ...frames),
      over32ms: frames.filter((value) => value > 32).length,
      over50ms: frames.filter((value) => value > 50).length,
      longTaskCount: longTasks.length,
      maxLongTaskMs: Math.max(0, ...longTasks),
    };
  }, name);

const runSmoothScenario = async (
  page: Page,
  name: string,
  action: () => Promise<void>,
  testInfo: TestInfo,
  limits = LIMITS
) => {
  await installSmoothProbe(page);
  await action();
  await page.waitForTimeout(300);
  const metrics = await readSmoothProbe(page, name);
  const renderer = await page.evaluate(() =>
    (window as Window & {
      __chardeskCanvasExperienceStats?: () => Record<string, number | null>;
    }).__chardeskCanvasExperienceStats?.() ?? null
  );
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify({ metrics, renderer }, null, 2),
    contentType: "application/json",
  });

  expect(metrics.frameCount, `${name} should capture enough frames`).toBeGreaterThan(30);
  expect(metrics.p95FrameMs, `${name} p95 frame interval`).toBeLessThanOrEqual(
    limits.p95FrameMs
  );
  expect(
    metrics.over50ms,
    `${name} >50ms frames; metrics=${JSON.stringify(metrics)}; renderer=${JSON.stringify(renderer)}`
  ).toBeLessThanOrEqual(
    limits.maxOver50msFrames
  );
  return metrics;
};

const dragFor = async (
  page: Page,
  start: { x: number; y: number },
  delta: { x: number; y: number },
  options: { button?: "left" | "middle"; durationMs?: number } = {}
) => {
  const button = options.button ?? "left";
  const durationMs = options.durationMs ?? SCENARIO_MS;
  const startedAt = Date.now();
  let step = 0;

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  while (Date.now() - startedAt < durationMs) {
    const t = step / 16;
    await page.mouse.move(
      start.x + Math.sin(t) * delta.x,
      start.y + Math.cos(t * 0.7) * delta.y
    );
    step += 1;
    await page.waitForTimeout(INPUT_FRAME_MS);
  }
  await page.mouse.up({ button });
};

const wheelFor = async (
  page: Page,
  options: { ctrl?: boolean; durationMs?: number } = {}
) => {
  const durationMs = options.durationMs ?? SCENARIO_MS;
  const startedAt = Date.now();
  let step = 0;

  if (options.ctrl) await page.keyboard.down("Control");
  while (Date.now() - startedAt < durationMs) {
    await page.mouse.wheel(
      options.ctrl ? 0 : step % 2 ? 26 : -18,
      options.ctrl ? (step % 2 ? 80 : -80) : 34
    );
    step += 1;
    await page.waitForTimeout(INPUT_FRAME_MS);
  }
  if (options.ctrl) await page.keyboard.up("Control");
};

const hoverFor = async (
  page: Page,
  options: { durationMs?: number } = {}
) => {
  const durationMs = options.durationMs ?? SCENARIO_MS;
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < durationMs) {
    await page.mouse.move(
      620 + Math.sin(step / 11) * 420,
      420 + Math.cos(step / 17) * 280
    );
    step += 1;
    await page.waitForTimeout(INPUT_FRAME_MS);
  }
};

test.describe.serial("Performance smoke", () => {
  test("startup resource budget", async ({ page }, testInfo) => {
    await openSeededCanvas(page, "freeform");

    const summary = await page.evaluate(() => {
      const resources = performance.getEntriesByType(
        "resource"
      ) as PerformanceResourceTiming[];
      const scripts = resources
        .filter((entry) => entry.initiatorType === "script")
        .map((entry) => ({
          name: entry.name.split("/").pop() ?? entry.name,
          encodedBodySize: entry.encodedBodySize,
          transferSize: entry.transferSize,
        }));
      const json = resources
        .filter((entry) => entry.name.includes("/data/"))
        .map((entry) => ({
          name: entry.name.split("/").pop() ?? entry.name,
          encodedBodySize: entry.encodedBodySize,
          transferSize: entry.transferSize,
        }));
      const largestScript = scripts.reduce(
        (largest, entry) =>
          entry.encodedBodySize > largest.encodedBodySize ? entry : largest,
        { name: "", encodedBodySize: 0, transferSize: 0 }
      );

      return {
        domNodes: document.querySelectorAll("*").length,
        canvasCount: document.querySelectorAll("canvas").length,
        scriptCount: scripts.length,
        largestScript,
        json,
        localStorageBytes: Object.entries(localStorage).reduce(
          (sum, [key, value]) => sum + key.length + value.length,
          0
        ),
      };
    });

    await testInfo.attach("startup-resources.json", {
      body: JSON.stringify(summary, null, 2),
      contentType: "application/json",
    });

    expect(summary.canvasCount).toBeGreaterThanOrEqual(3);
    expect(summary.largestScript.encodedBodySize).toBeLessThanOrEqual(500_000);
  });

  test("freeform pan, wheel, and zoom stay smooth", async ({ page }, testInfo) => {
    await openSeededCanvas(page, "freeform");

    const pan = await runSmoothScenario(
      page,
      "freeform-pan",
      () => dragFor(page, { x: 720, y: 450 }, { x: 260, y: 120 }, { button: "middle" }),
      testInfo
    );
    const wheel = await runSmoothScenario(
      page,
      "freeform-wheel-pan",
      () => wheelFor(page),
      testInfo
    );
    const zoom = await runSmoothScenario(
      page,
      "freeform-ctrl-wheel-zoom",
      () => wheelFor(page, { ctrl: true }),
      testInfo
    );

    await testInfo.attach("freeform-summary.json", {
      body: JSON.stringify([pan, wheel, zoom], null, 2),
      contentType: "application/json",
    });
  });

  test("slide pan, wheel, and zoom use the shared exact renderer", async ({ page }, testInfo) => {
    await openSeededCanvas(page, "slide");
    await expect.poll(() => page.evaluate(() => {
      return (window as Window & {
        __chardeskCanvasExperienceStats?: () => { directFrames: number };
      }).__chardeskCanvasExperienceStats?.().directFrames ?? 0;
    })).toBeGreaterThan(0);
    const readRenderWork = () =>
      page.evaluate(() => {
        const diagnostics = window as Window & {
          __chardeskCanvasExperienceStats?: () => {
            directFrames: number;
            totalDirectGlyphs: number;
            maxFrameDurationMs: number;
          };
        };
        return diagnostics.__chardeskCanvasExperienceStats?.() ?? null;
      });
    const before = await readRenderWork();

    const pan = await runSmoothScenario(
      page,
      "slide-pan",
      () => dragFor(page, { x: 720, y: 450 }, { x: 260, y: 120 }, { button: "middle" }),
      testInfo
    );
    const wheel = await runSmoothScenario(
      page,
      "slide-wheel-pan",
      () => wheelFor(page),
      testInfo
    );
    const zoom = await runSmoothScenario(
      page,
      "slide-ctrl-wheel-zoom",
      () => wheelFor(page, { ctrl: true }),
      testInfo
    );
    const after = await readRenderWork();

    expect(after?.directFrames ?? 0).toBeGreaterThan(before?.directFrames ?? 0);
    expect(after?.totalDirectGlyphs ?? 0).toBeGreaterThan(
      before?.totalDirectGlyphs ?? 0
    );

    await testInfo.attach("slide-summary.json", {
      body: JSON.stringify({ scenarios: [pan, wheel, zoom], before, after }, null, 2),
      contentType: "application/json",
    });
  });

  test("structured selection and node drag stay smooth", async ({ page }, testInfo) => {
    await openSeededCanvas(page, "structured");

    const dragPoint = {
      x: 180 + 10 * DEFAULT_CANVAS_CELL_METRICS.cellWidth,
      y: 130 + 7 * DEFAULT_CANVAS_CELL_METRICS.cellHeight,
    };
    const selection = await runSmoothScenario(
      page,
      "structured-selection",
      () => dragFor(page, { x: 70, y: 90 }, { x: 70, y: 36 }),
      testInfo
    );
    const nodeDrag = await runSmoothScenario(
      page,
      "structured-node-drag",
      () => dragFor(page, dragPoint, { x: 120, y: 64 }),
      testInfo
    );

    await testInfo.attach("structured-summary.json", {
      body: JSON.stringify([selection, nodeDrag], null, 2),
      contentType: "application/json",
    });
  });

  test("1k-node structured hover and pan stay smooth", async ({ page }, testInfo) => {
    await openSeededCanvas(page, "structured", { structuredNodeCount: 1_000 });

    const hover = await runSmoothScenario(
      page,
      "structured-1k-hover",
      () => hoverFor(page),
      testInfo
    );
    const pan = await runSmoothScenario(
      page,
      "structured-1k-pan",
      () =>
        dragFor(
          page,
          { x: 720, y: 450 },
          { x: 260, y: 120 },
          { button: "middle" }
        ),
      testInfo
    );

    await testInfo.attach("structured-1k-summary.json", {
      body: JSON.stringify([hover, pan], null, 2),
      contentType: "application/json",
    });
  });

  test("large cached structured session switches atomically", async ({ page }, testInfo) => {
    await seedSessionSwitch(page);
    await page.goto("/");
    await page.locator("canvas").first().waitFor();
    await page.getByRole("button", { name: "Select canvas" }).click();

    await page.evaluate(() => {
      const probe = {
        startedAt: performance.now(),
        frames: [] as number[],
        longTasks: [] as number[],
        observer: null as PerformanceObserver | null,
      };
      let previousFrame = probe.startedAt;
      const sampleFrame = (now: number) => {
        probe.frames.push(now - previousFrame);
        previousFrame = now;
        if (probe.frames.length < 120) requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
      try {
        probe.observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => probe.longTasks.push(entry.duration));
        });
        probe.observer.observe({ entryTypes: ["longtask"] });
      } catch {
        probe.observer = null;
      }
      window.__sessionSwitchPerf = probe;
    });

    await page
      .getByRole("button", { name: /^Structured Canvas 1$/ })
      .click();
    await expect(page.getByRole("button", { name: "Select canvas" })).toContainText(
      "Structured Canvas 1"
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    const metrics = await page.evaluate(() => {
      const probe = window.__sessionSwitchPerf;
      probe.observer?.disconnect();
      return {
        elapsedMs: performance.now() - probe.startedAt,
        maxFrameMs: Math.max(0, ...probe.frames),
        maxLongTaskMs: Math.max(0, ...probe.longTasks),
        longTaskCount: probe.longTasks.length,
      };
    });

    await testInfo.attach("session-switch.json", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    expect(metrics.elapsedMs).toBeLessThanOrEqual(500);
    expect(metrics.maxFrameMs).toBeLessThanOrEqual(200);
    expect(metrics.maxLongTaskMs).toBeLessThanOrEqual(200);
  });
});

declare global {
  interface Window {
    __asciiPerf: {
      frames: number[];
      longTasks: number[];
      rafId: number;
      observer: PerformanceObserver | null;
    };
    __sessionSwitchPerf: {
      startedAt: number;
      frames: number[];
      longTasks: number[];
      observer: PerformanceObserver | null;
    };
  }
}
