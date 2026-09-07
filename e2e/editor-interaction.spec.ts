import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_GRID_GEOMETRY } from "../src/shared/metrics/gridGeometry";

const STORAGE_KEY = "chardesk-persistence";
const VIEWPORT = { offset: { x: 180, y: 130 }, zoom: 1 };
const UNDO_SHORTCUT = process.platform === "darwin" ? "Meta+z" : "Control+z";

const seedSession = async (
  page: Page,
  input: {
    id: string;
    mode: "freeform" | "structured";
    grid?: unknown[];
    scene?: unknown[];
    brushColor?: string;
  }
) => {
  const session = {
    id: input.id,
    name: input.id,
    mode: input.mode,
    scene: input.scene ?? [],
    grid: input.grid ?? [],
    viewport: VIEWPORT,
  };
  const persisted = {
    state: {
      offset: VIEWPORT.offset,
      zoom: VIEWPORT.zoom,
      canvasMode: session.mode,
      structuredScene: session.scene,
      structuredComponents: [],
      brushChar: "#",
      brushColor: input.brushColor ?? "#111827",
      showGrid: true,
      exportShowGrid: false,
      canvasSessions: [session],
      activeCanvasId: session.id,
      grid: session.grid,
    },
    version: 0,
  };
  await page.addInitScript(({ storageKey, value }) => {
    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, { storageKey: STORAGE_KEY, value: persisted });
  await page.reload();
  await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
  await expect.poll(async () => (await readState(page))?.activeCanvasId)
    .toBe(input.id);
  await expect.poll(() => page.evaluate(
    'import("/src/app/compositionRoot.ts").then(({ getApplicationEditorHost }) => getApplicationEditorHost().canvas.getState().canvasMode)'
  )).toBe(input.mode);
};

const readState = (page: Page) => page.evaluate((storageKey) => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const state = JSON.parse(raw).state;
  return state.workspace && state.sessions
    ? {
        ...state.workspace,
        ...state.preferences,
        canvasSessions: state.sessions.items,
        activeCanvasId: state.sessions.activeId,
      }
    : state;
}, STORAGE_KEY);

const readActiveGrid = async (page: Page) => {
  const state = await readState(page);
  const session = state?.canvasSessions?.find(
    (candidate: { id: string }) => candidate.id === state.activeCanvasId
  );
  return state?.grid ?? session?.grid ?? [];
};

const readActiveScene = async (page: Page) => {
  const state = await readState(page);
  const session = state?.canvasSessions?.find(
    (candidate: { id: string }) => candidate.id === state.activeCanvasId
  );
  return state?.structuredScene ?? session?.scene ?? [];
};

const readLiveGrid = (page: Page) =>
  page.evaluate<Array<[string, unknown]>>(
    'import("/src/app/compositionRoot.ts").then(({ getApplicationEditorHost }) => { const canvas = getApplicationEditorHost().canvas; return canvas.documents.getDocumentSeed(canvas.documents.getActiveDocumentId(), "freeform")?.grid ?? []; })'
  );

const readLiveInteraction = (page: Page) =>
  page.evaluate<{ scratchSize: number; interactionType: string }>(
    'import("/src/app/compositionRoot.ts").then(({ getApplicationEditorHost }) => { const host = getApplicationEditorHost(); return { scratchSize: host.canvas.getState().scratchLayer?.size ?? 0, interactionType: host.editor.getInteractionState().type }; })'
  );

const gridClientPoint = async (page: Page, point: { x: number; y: number }) => {
  const box = await page.getByTestId("canvas-editor-surface").boundingBox();
  expect(box).not.toBeNull();
  return {
    x:
      box!.x +
      VIEWPORT.offset.x +
      point.x * DEFAULT_GRID_GEOMETRY.cellWidth,
    y:
      box!.y +
      VIEWPORT.offset.y +
      point.y * DEFAULT_GRID_GEOMETRY.cellHeight,
  };
};

const selectCanvasTool = async (page: Page, tool: "box" | "line") => {
  await page.locator('[data-toolbar-item="shape-group"] [data-toolbar-submenu-trigger="true"]').click();
  await page.getByRole("menuitemradio", {
    name: tool === "box" ? "Box" : "Line",
    exact: true,
  }).click();
  await expect(
    page.locator('[data-toolbar-item="shape-group"] > button').first()
  ).toHaveAttribute("aria-label", tool === "box" ? "Box" : "Line");
};

const drawBox = async (
  page: Page,
  startGrid: { x: number; y: number },
  endGrid: { x: number; y: number }
) => {
  await selectCanvasTool(page, "box");
  const start = await gridClientPoint(page, startGrid);
  const end = await gridClientPoint(page, endGrid);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await expect.poll(() => readLiveInteraction(page)).toMatchObject({
    interactionType: "shapePreview",
  });
  await expect.poll(async () => (await readLiveInteraction(page)).scratchSize)
    .toBeGreaterThan(0);
  await page.mouse.up();
};

test.describe("editor interaction lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
  });

  test("Escape cancels an active shape transaction", async ({ page }) => {
    await seedSession(page, { id: "cancel-shape", mode: "freeform" });
    await selectCanvasTool(page, "box");
    const start = await gridClientPoint(page, { x: 2, y: 8 });
    const end = await gridClientPoint(page, { x: 6, y: 10 });

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect.poll(() => readActiveGrid(page)).toEqual([]);
    await expect.poll(() => readLiveInteraction(page)).toEqual({
      scratchSize: 0,
      interactionType: "idle",
    });
  });

  test("tool changes interrupt the active tool without committing its preview", async ({ page }) => {
    await seedSession(page, { id: "switch-tool", mode: "freeform" });
    await selectCanvasTool(page, "box");
    const start = await gridClientPoint(page, { x: 1, y: 8 });
    const end = await gridClientPoint(page, { x: 5, y: 10 });

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    await page.keyboard.press("Alt+2");
    await page.mouse.up();

    await expect(
      page.getByTestId("tool-dock").getByRole("button", { name: "Select" })
    ).toHaveClass(/bg-control-active-surface/);
    await expect.poll(() => readActiveGrid(page)).toEqual([]);
    await expect.poll(() => readLiveInteraction(page)).toEqual({
      scratchSize: 0,
      interactionType: "idle",
    });
  });

  test("undo removes the completed line while preserving the previous box", async ({ page }) => {
    await seedSession(page, { id: "freeform-shape-undo", mode: "freeform" });
    await drawBox(page, { x: 1, y: 8 }, { x: 5, y: 10 });
    await expect.poll(async () => (await readLiveGrid(page)).length)
      .toBeGreaterThan(0);
    const boxGrid = await readLiveGrid(page);

    await selectCanvasTool(page, "line");
    const start = await gridClientPoint(page, { x: 8, y: 8 });
    const end = await gridClientPoint(page, { x: 12, y: 10 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await readLiveGrid(page)).length)
      .toBeGreaterThan(boxGrid.length);

    await page.keyboard.press(UNDO_SHORTCUT);

    await expect.poll(() => readLiveGrid(page)).toEqual(boxGrid);
    await expect.poll(() => readLiveInteraction(page)).toEqual({
      scratchSize: 0,
      interactionType: "idle",
    });
  });

  test("undo during a line gesture cancels only that gesture", async ({ page }) => {
    await seedSession(page, { id: "freeform-active-undo", mode: "freeform" });
    await drawBox(page, { x: 1, y: 8 }, { x: 5, y: 10 });
    await expect.poll(async () => (await readLiveGrid(page)).length)
      .toBeGreaterThan(0);
    const boxGrid = await readLiveGrid(page);

    await selectCanvasTool(page, "line");
    const start = await gridClientPoint(page, { x: 8, y: 8 });
    const end = await gridClientPoint(page, { x: 12, y: 10 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.keyboard.press(UNDO_SHORTCUT);

    await expect.poll(() => readLiveGrid(page)).toEqual(boxGrid);
    await expect.poll(() => readLiveInteraction(page)).toEqual({
      scratchSize: 0,
      interactionType: "idle",
    });

    await page.mouse.up();
    await expect.poll(() => readLiveGrid(page)).toEqual(boxGrid);
  });

  test("split-box divider drag crosses pending state and commits the ratio", async ({ page }) => {
    await seedSession(page, {
      id: "split-divider",
      mode: "structured",
      scene: [{
        id: "split-1",
        type: "splitBox",
        order: 1,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 4 },
        verticalSplitRatio: 0.36,
        topSplitRatio: 0.25,
        bottomSplitRatio: 0.75,
        style: { color: "#111827" },
      }],
    });
    const start = await gridClientPoint(page, { x: 4, y: 2 });
    const end = await gridClientPoint(page, { x: 6, y: 2 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => {
      const scene = await readActiveScene(page);
      return scene.find((node: { id: string }) => node.id === "split-1")
        ?.verticalSplitRatio;
    }).toBeCloseTo(0.6, 5);
  });

  test("edge scrolling moves the viewport during an active selection", async ({ page }) => {
    await seedSession(page, { id: "edge-scroll", mode: "freeform" });
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const surface = page.getByTestId("canvas-editor-surface");
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    const start = await gridClientPoint(page, { x: 2, y: 2 });

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 2, start.y, { steps: 5 });
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect.poll(async () => (await readState(page))?.offset?.x)
      .not.toBe(VIEWPORT.offset.x);
  });

  test("canvas color picking updates the active brush color", async ({ page }) => {
    await seedSession(page, {
      id: "color-pick",
      mode: "freeform",
      grid: [["0,0", { char: "A", color: "#ff0000" }]],
    });
    const colorItem = page.locator('[data-toolbar-item="color"]');
    await colorItem.locator("button").last().click();
    await page.getByRole("button", { name: "Pick color from canvas" }).click();
    await page.getByRole("menuitem", {
      name: "Pick char color from canvas",
    }).click();
    const cell = await gridClientPoint(page, { x: 0, y: 0 });
    await page.mouse.click(
      cell.x + DEFAULT_GRID_GEOMETRY.cellWidth / 2,
      cell.y + DEFAULT_GRID_GEOMETRY.cellHeight / 2
    );

    await expect.poll(async () => (await readState(page))?.brushColor)
      .toBe("#ff0000");
  });

  test("remote content remains when the receiving peer starts editing", async ({ page, context }) => {
    test.slow();
    await seedSession(page, { id: "collaboration-edit", mode: "freeform" });
    await page.getByTestId("collaboration-control").click();
    await page.getByRole("button", { name: "Start P2P room" }).click();
    const roomUrl = page.url();
    expect(roomUrl).toContain("room=");

    const peer = await context.newPage();
    await peer.setViewportSize({ width: 1440, height: 900 });
    await peer.goto(roomUrl);
    await expect(peer.getByTestId("canvas-editor-surface")).toBeVisible();
    await peer.getByTestId("collaboration-control").click();
    await expect(peer.getByText("2 participant(s)", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await peer.keyboard.press("Escape");
    await page.getByTestId("collaboration-control").click();
    await expect(page.getByText("2 participant(s)", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(
      'import("/src/app/compositionRoot.ts").then(({ getApplicationEditorHost }) => { const snapshot = getApplicationEditorHost().collaboration.getSnapshot(); return { canEdit: snapshot.canEdit, documentStatus: snapshot.documentStatus, connectionStatus: snapshot.connectionStatus }; })'
    )).toEqual({
      canEdit: true,
      documentStatus: "ready",
      connectionStatus: "online",
    });

    await drawBox(page, { x: 1, y: 1 }, { x: 4, y: 2 });
    await expect.poll(async () => (await readLiveGrid(page)).length).toBeGreaterThan(0);
    await expect.poll(async () => (await readLiveGrid(peer)).length, {
      timeout: 15_000,
    }).toBeGreaterThan(0);
    const remoteGrid = await readLiveGrid(peer);

    await drawBox(peer, { x: 1, y: 5 }, { x: 4, y: 6 });
    await expect.poll(async () => (await readLiveGrid(page)).length, {
      timeout: 15_000,
    }).toBeGreaterThan(remoteGrid.length);
    const mergedGrid = await readLiveGrid(page);
    const mergedKeys = new Set(mergedGrid.map(([key]) => key));
    for (const [key] of remoteGrid) {
      expect(mergedKeys.has(key)).toBe(true);
    }
  });
});
