import { expect, test } from "@playwright/test";
import { CELL_SURFACE_GUARD_CELLS } from "@chardesk/cell-ui/browser";
import { canvasFor, cellPoint, ownerBounds, readCellMetrics, readCellPixel, readCellProbe } from "./helpers/cell-probe";

const rowRaster = async (surface: ReturnType<typeof canvasFor>, x: number, y: number, width: number,
  metrics: Awaited<ReturnType<typeof readCellMetrics>>) => surface.evaluate((canvas, args) => {
  const scale = devicePixelRatio;
  const pixels = canvas.getContext("2d")!.getImageData(
    Math.round((args.x + args.guard) * args.metrics.cellWidth * scale),
    Math.round((args.y + args.guard) * args.metrics.cellHeight * scale),
    Math.round(args.width * args.metrics.cellWidth * scale),
    Math.round(args.metrics.cellHeight * scale),
  ).data;
  let hash = 2166136261;
  for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
  return hash >>> 0;
}, { x, y, width, metrics, guard: CELL_SURFACE_GUARD_CELLS });

test("browser overlay host coordinates separate Cell surfaces", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Open host menu" });
  const popup = page.locator('[data-cell-overlay-portal=""]');
  const canvas = page.locator('[data-testid="host-canvas-surface"]');
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(popup.getByRole("menuitem", { name: "Choose menu item" })).toBeVisible();
  const popupMetrics = await readCellMetrics(page.locator('[data-cell-probe="host-menu-surface"]'));
  const popupCanvas = popup.locator("canvas").first();
  const topSurface = (await page.getByTestId("host-top-surface").boundingBox())!;
  expect((await popupCanvas.boundingBox())!.y + popupMetrics.cellHeight)
    .toBeCloseTo(topSurface.y + topSurface.height, 0);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.press("Enter");
  await expect(popup).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 10);
  await expect(popup).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 700 });
  await trigger.press("Enter");
  await expect(popup).toBeVisible();
  const narrow = (await popupCanvas.boundingBox())!;
  expect(narrow.x + narrow.width - popupMetrics.cellWidth).toBeLessThanOrEqual(390);
});

test("context menu opens at a pointer anchor outside the top surface", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const canvas = page.locator('[data-testid="host-canvas-surface"]');
  await canvas.locator("canvas").first().click({ button: "right" });
  const context = page.locator('[data-cell-overlay-portal=""]');
  await expect(context.getByRole("menuitem", { name: "Context action" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(context).toHaveCount(0);
});

test("nested menus dismiss from the top and return focus to their parent", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Open host menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const parent = page.getByRole("menu", { name: "Host menu" });
  const more = parent.getByRole("menuitem", { name: "More actions" });
  await more.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Nested action" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menuitem", { name: "Nested action" })).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(more).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(parent).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("host submenu opens on hover and closes when another parent item is hovered", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Open host menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const parent = page.locator('[data-cell-probe="host-menu-surface"]');
  const more = ownerBounds(await readCellProbe(parent), "host-menu-more");
  const morePoint = await cellPoint(parent, more.x + 1, more.y);
  await page.mouse.move(morePoint.x, morePoint.y);
  const child = page.locator('[data-cell-probe="host-submenu"]');
  await expect(child).toBeVisible();
  const nested = ownerBounds(await readCellProbe(child), "host-submenu-item");
  const nestedPoint = await cellPoint(child, nested.x + 1, nested.y);
  await page.mouse.move(nestedPoint.x, nestedPoint.y);
  await expect(child).toBeVisible();
  const choose = ownerBounds(await readCellProbe(parent), "host-menu-item");
  const choosePoint = await cellPoint(parent, choose.x + 1, choose.y);
  await page.mouse.move(choosePoint.x, choosePoint.y);
  await expect(child).toHaveCount(0);
});

test("one outside click dismisses the full menu chain", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Open host menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Nested action" })).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width - 8, viewport.height - 8);
  await expect(page.locator('[data-cell-overlay-portal=""]')).toHaveCount(0);
});

test("rapid submenu activation reaches the child item", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Open host menu" });
  const popup = page.locator('[data-cell-overlay-portal=""]');
  for (let attempt = 0; attempt < 8; attempt++) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("confirmation stays modal across separate surfaces", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const canvas = page.locator('[data-testid="host-canvas-surface"]');
  const alertTrigger = page.getByRole("button", { name: "Open alert dialog" });
  await alertTrigger.focus();
  await page.keyboard.press("Enter");
  const alert = page.getByRole("alertdialog", { name: "Delete item?" });
  await expect(alert).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect(alert.getByRole("button", { name: "Cancel delete" })).toBeFocused();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 10, { force: true });
  await expect(alert).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(alert).toHaveCount(0);
});

test("toast appears above the host without stealing focus", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const trigger = page.getByRole("button", { name: "Show toast" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-cell-toast="host-toast"]')).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("canvas-layer order changes through Cell commands", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const layers = page.getByRole("listbox", { name: "Canvas layers" });
  await expect(layers.getByRole("option")).toHaveCount(3);
  await layers.getByRole("option", { name: "Title" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(layers.getByRole("option")).toHaveText(["Chart", "Title", "Notes"]);
  await expect(layers.getByRole("option", { name: "Title" })).toBeFocused();
});

test("dragging a Cell row reorders the same app-owned layer list", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const surface = page.locator('[data-cell-probe="host-canvas-surface"]');
  const initial = await readCellProbe(surface);
  const source = ownerBounds(initial, "layer-title");
  const neighbor = ownerBounds(initial, "layer-chart");
  const target = ownerBounds(initial, "layer-notes");
  const start = await cellPoint(surface, source.x, source.y);
  const end = await cellPoint(surface, target.x, target.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const canvas = canvasFor(surface);
  const metrics = await readCellMetrics(surface);
  const neighborBefore = await rowRaster(canvas, neighbor.x, neighbor.y, neighbor.width, metrics);
  const targetBefore = await rowRaster(canvas, target.x, target.y, target.width, metrics);
  const ghostCell = { x: target.x + Math.min(source.width - 1, 12), y: target.y };
  const restingPixel = await readCellPixel(surface, ghostCell.x, ghostCell.y);
  const committedText = (await readCellProbe(surface)).text;
  await page.mouse.move(start.x, start.y + metrics.cellHeight * 0.6);
  await expect.poll(() => rowRaster(canvas, neighbor.x, neighbor.y, neighbor.width, metrics))
    .toBe(neighborBefore);
  await expect.poll(async () => (await readCellPixel(surface, source.x + 12, source.y)).slice(0, 3))
    .toEqual([0, 0, 0]);
  await page.mouse.move(start.x, start.y + metrics.cellHeight * 1.5);
  await expect.poll(() => rowRaster(canvas, source.x, source.y, neighbor.width, metrics))
    .toBe(neighborBefore);
  await expect.poll(() => rowRaster(canvas, target.x, target.y, target.width, metrics))
    .toBe(targetBefore);
  await expect.poll(async () => (await readCellPixel(surface, neighbor.x + 12, neighbor.y)).slice(0, 3))
    .toEqual([0, 0, 0]);
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await expect.poll(async () => (await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3))
    .toEqual([0, 0, 0]);
  // ResizeObserver can repaint after the pointer frame; the projected row must survive it.
  await page.waitForTimeout(200);
  expect((await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3)).toEqual([0, 0, 0]);
  expect(restingPixel.slice(0, 3)).not.toEqual([0, 0, 0]);
  expect(await rowRaster(canvas, source.x, source.y, neighbor.width, metrics)).toBe(neighborBefore);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ ...viewport, width: viewport.width - 1 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3)).toEqual([0, 0, 0]);
  await page.setViewportSize(viewport);
  await page.evaluate(() => document.fonts.dispatchEvent(new Event("loadingdone")));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect((await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3)).toEqual([0, 0, 0]);
  expect((await readCellProbe(surface)).text).toBe(committedText);
  await expect(page.getByRole("listbox", { name: "Canvas layers" }).getByRole("option"))
    .toHaveText(["Title", "Chart", "Notes"]);
  await page.mouse.up();
  await expect(page.getByRole("listbox", { name: "Canvas layers" }).getByRole("option"))
    .toHaveText(["Chart", "Notes", "Title"]);
});

test("reorder preview cancels outside the list without changing item order", async ({ page }) => {
  await page.goto("/#/__fixtures/overlay-host");
  const surface = page.locator('[data-cell-probe="host-canvas-surface"]');
  const initial = await readCellProbe(surface);
  const source = ownerBounds(initial, "layer-title");
  const target = ownerBounds(initial, "layer-notes");
  const start = await cellPoint(surface, source.x, source.y);
  const end = await cellPoint(surface, target.x, target.y);
  const outside = await cellPoint(surface, source.x + 60, source.y + 2, { scrollIntoView: false });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const canvas = canvasFor(surface);
  const metrics = await readCellMetrics(surface);
  const originalRow = await rowRaster(canvas, source.x, source.y, source.width, metrics);
  const ghostCell = { x: target.x + Math.min(source.width - 1, 12), y: target.y };
  const restingPixel = await readCellPixel(surface, ghostCell.x, ghostCell.y);
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await expect.poll(() => rowRaster(canvas, source.x, source.y, source.width, metrics))
    .not.toBe(originalRow);
  await expect.poll(async () => (await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3))
    .toEqual([0, 0, 0]);
  await page.mouse.move(outside.x, outside.y, { steps: 4 });
  await expect.poll(async () => (await readCellPixel(surface, ghostCell.x, ghostCell.y)).slice(0, 3))
    .toEqual(restingPixel.slice(0, 3));
  await page.mouse.up();
  await expect(page.getByRole("listbox", { name: "Canvas layers" }).getByRole("option"))
    .toHaveText(["Title", "Chart", "Notes"]);
  await expect(surface).not.toHaveAttribute("data-cell-manipulating", "true");
});

test("former host guide redirects to the integration contract", async ({ page }) => {
  await page.goto("/#/guides/host-overlays");
  await expect(page).toHaveURL(/#\/guides\/integration\?section=overlays$/);
  await expect(page.getByRole("heading", { name: "Overlay host", level: 2 })).toBeVisible();
});
