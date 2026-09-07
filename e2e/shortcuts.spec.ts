import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_GRID_GEOMETRY } from "../src/shared/metrics/gridGeometry";

const STORAGE_KEY = "chardesk-persistence";
// Keep seeded content in the unobstructed center of the Canvas. Coordinates near
// the left edge can hit the character library instead of the Canvas surface.
const VIEWPORT = { offset: { x: 720, y: 450 }, zoom: 1 };

const seedFreeformSelection = async (
  page: Page,
  options: { releasePointer?: boolean } = {}
) => {
  await page.evaluate(
    ({ storageKey, viewport }) => {
      const session = {
        id: "shortcut-e2e",
        name: "Shortcut E2E",
        mode: "freeform",
        scene: [],
        grid: [
          ["0,0", { char: "A", color: "#111827" }],
          ["1,0", { char: "B", color: "#111827" }],
        ],
        viewport,
      };
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: {
            offset: viewport.offset,
            zoom: viewport.zoom,
            canvasMode: session.mode,
            structuredScene: [],
            structuredComponents: [],
            brushChar: "#",
            brushColor: "#111827",
            showGrid: true,
            exportShowGrid: false,
            canvasSessions: [session],
            activeCanvasId: session.id,
            grid: session.grid,
          },
          version: 0,
        })
      );
    },
    { storageKey: STORAGE_KEY, viewport: VIEWPORT }
  );
  await page.reload();
  const surface = page.getByTestId("canvas-editor-surface");
  await expect(surface).toBeVisible();
  await page
    .getByTestId("tool-dock")
    .getByRole("button", { name: "Select", exact: true })
    .click();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const start = {
    x: box!.x + VIEWPORT.offset.x + 2,
    y: box!.y + VIEWPORT.offset.y + 8,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + DEFAULT_GRID_GEOMETRY.cellWidth + 4,
    start.y,
    { steps: 3 }
  );
  if (options.releasePointer !== false) await page.mouse.up();
  await expect(surface.locator("textarea")).toBeFocused();
};

const readGrid = (page: Page) =>
  page.evaluate((storageKey) => {
    const snapshot = localStorage.getItem(storageKey);
    if (!snapshot) return [];
    const state = JSON.parse(snapshot).state;
    return state.workspace?.grid ?? state.grid;
  }, STORAGE_KEY);

const readViewportEvidence = (page: Page) =>
  page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      '[data-testid="canvas-editor-surface"]'
    );
    const viewportLayer = document.querySelector<HTMLElement>(
      '[data-testid="canvas-viewport-layer"]'
    );
    const textarea = surface?.querySelector<HTMLTextAreaElement>("textarea");
    if (!surface || !viewportLayer || !textarea) return null;
    return {
      transform: getComputedStyle(viewportLayer).transform,
      surfaceScroll: { left: surface.scrollLeft, top: surface.scrollTop },
      windowScroll: { x: window.scrollX, y: window.scrollY },
      textareaLeft: Number.parseFloat(textarea.style.left),
    };
  });

const seedFreeformNavigation = async (page: Page) => {
  await page.evaluate(
    ({ storageKey, viewport }) => {
      const session = {
        id: "grid-navigation-e2e",
        name: "Grid Navigation E2E",
        mode: "freeform",
        scene: [],
        grid: [
          ["0,0", { char: "A", color: "#111827" }],
          ["1,0", { char: "B", color: "#111827" }],
          ["4,0", { char: "C", color: "#111827" }],
        ],
        viewport,
      };
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: {
            offset: viewport.offset,
            zoom: viewport.zoom,
            canvasMode: session.mode,
            structuredScene: [],
            structuredComponents: [],
            brushChar: "#",
            brushColor: "#111827",
            showGrid: true,
            exportShowGrid: false,
            canvasSessions: [session],
            activeCanvasId: session.id,
            grid: session.grid,
          },
          version: 0,
        })
      );
    },
    { storageKey: STORAGE_KEY, viewport: VIEWPORT }
  );
  await page.reload();
  const surface = page.getByTestId("canvas-editor-surface");
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const eventInit = {
    button: 0,
    buttons: 1,
    clientX:
      box!.x +
      VIEWPORT.offset.x +
      DEFAULT_GRID_GEOMETRY.cellWidth / 2,
    clientY: box!.y + VIEWPORT.offset.y + 9,
    pointerId: 1,
    pointerType: "mouse",
  };
  await surface.dispatchEvent("pointerdown", eventInit);
  await surface.dispatchEvent("pointerup", { ...eventInit, buttons: 0 });
  await expect(surface.locator("textarea")).toBeFocused();
};

test.describe("editor clipboard shortcuts", () => {
  test.beforeEach(async ({ browserName, context, page }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
  });

  for (const shortcut of ["Meta+x", "Control+x"]) {
    test(`${shortcut} cuts the managed canvas selection`, async ({ page }) => {
      await seedFreeformSelection(page);

      await page.keyboard.press(shortcut);

      await expect.poll(() => readGrid(page)).toEqual([]);
    });
  }

  test("copies the first committed Canvas range", async ({ browserName, page }) => {
    test.skip(
      browserName === "webkit",
      "Playwright WebKit does not bridge the native system clipboard"
    );
    await seedFreeformSelection(page);
    await page.evaluate(() => navigator.clipboard.writeText("marker"));

    await page.keyboard.press("Meta+c");

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("AB");
  });

  test("finalizes the visible range when Copy arrives before pointerup", async ({
    browserName,
    page,
  }) => {
    test.skip(
      browserName === "webkit",
      "Playwright WebKit does not bridge the native system clipboard"
    );
    await seedFreeformSelection(page, { releasePointer: false });
    await page.evaluate(() => navigator.clipboard.writeText("marker"));

    await page.keyboard.press("Meta+c");
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("AB");
  });

  test("platform digits select visible Dock tools without reserving Shift+H", async ({
    page,
  }, testInfo) => {
    const dock = page.getByTestId("tool-dock");
    const handItem = dock.getByRole("button", { name: "Hand" });
    const selectItem = dock.getByRole("button", { name: "Select" });

    const dockModifier =
      testInfo.project.name === "webkit-shortcuts" ? "Control" : "Alt";
    await page.keyboard.press(`${dockModifier}+1`);
    await expect(handItem).toHaveClass(/bg-control-active-surface/);

    await page.keyboard.press(`${dockModifier}+2`);
    await expect(selectItem).toHaveClass(/bg-control-active-surface/);

    await page.keyboard.press("Shift+H");
    await expect(selectItem).toHaveClass(/bg-control-active-surface/);

    await page.keyboard.press(`${dockModifier}+6`);
    const colorDialog = page.getByRole("dialog", { name: "Color" });
    await expect(colorDialog).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(colorDialog).toBeHidden();

    await dock.getByRole("button", { name: "Hand" }).hover();
    await expect(page.getByRole("tooltip")).toContainText(/(?:Alt\+|⌃)1/);
  });

  test("Meta+Arrow navigates grid content without moving the viewport", async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "Chromium viewport regression");
    await seedFreeformNavigation(page);

    const initial = await readViewportEvidence(page);
    expect(initial).not.toBeNull();
    await page.keyboard.press("Meta+ArrowRight");
    const nextContent = await readViewportEvidence(page);
    expect(nextContent!.textareaLeft).toBeGreaterThan(initial!.textareaLeft);
    expect(nextContent).toMatchObject({
      transform: initial!.transform,
      surfaceScroll: initial!.surfaceScroll,
      windowScroll: initial!.windowScroll,
    });
  });

  test("Meta+x followed by Meta+v restores the cut selection", async ({
    browserName,
    page,
  }) => {
    test.skip(browserName === "webkit", "Playwright WebKit does not bridge the native system clipboard");
    await seedFreeformSelection(page);

    await page.keyboard.press("Meta+x");
    await expect.poll(() => readGrid(page)).toEqual([]);

    await page.keyboard.press("Meta+v");
    await expect.poll(() => readGrid(page)).toEqual([
      ["0,0", { char: "A", color: "#111827" }],
      ["1,0", { char: "B", color: "#111827" }],
    ]);
  });

  test("native paste data restores a cut selection", async ({ page }) => {
    await seedFreeformSelection(page);

    await page.keyboard.press("Meta+x");
    await expect.poll(() => readGrid(page)).toEqual([]);

    await page.evaluate(() => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "AB");
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        })
      );
    });
    await expect.poll(() => readGrid(page)).toEqual([
      ["0,0", { char: "A", color: "#111827" }],
      ["1,0", { char: "B", color: "#111827" }],
    ]);
  });
});
