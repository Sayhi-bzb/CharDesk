import { expect, test } from "@playwright/test";
import { readCellProbe, readCellMetrics } from "./helpers/cell-probe";

test("Select overlay receives hover outside the base canvas and respects DOM occlusion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/#/components/button");
  const surface = page.locator('[data-cell-probe="gallery-font-select"]');
  const base = surface.locator("canvas:not([data-cell-overlay-root])");
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font-status", /^(idle|error)$/);
  await surface.getByRole("button").evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("listbox")).toBeAttached();
  const frame = await readCellProbe(surface);
  const plane = frame.overlays[0]!;
  const row = plane.text.split("\n").findIndex((line) => line.includes("Fusion"));
  expect(row).toBeGreaterThanOrEqual(0);
  const metrics = await readCellMetrics(surface);
  const bounds = (await base.boundingBox())!;
  const x = bounds.x + (plane.bounds.x + 3.5) * metrics.cellWidth;
  const y = bounds.y + (plane.bounds.y + row + 1.5) * metrics.cellHeight;
  expect(y).toBeGreaterThan(bounds.y + bounds.height);
  await page.mouse.move(x, y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "gallery-font-option-fusion-mono");
  const overlay = surface.locator('[data-cell-overlay-root="gallery-font-content"]');
  await expect(overlay).toHaveCSS("cursor", "pointer");
  const hovered = await readCellProbe(surface);
  expect(hovered.cells.some((cell) => cell.ownerId === "gallery-font-option-fusion-mono"
    && cell.style.backgroundColor === "rgb(0, 0, 0)")).toBe(true);
  const pixel = await overlay.evaluate((canvas, { x, y }) => {
    const bounds = canvas.getBoundingClientRect();
    return Array.from(canvas.getContext("2d")!.getImageData(
      Math.floor((x - bounds.x) * canvas.width / bounds.width),
      Math.floor((y - bounds.y) * canvas.height / bounds.height), 1, 1,
    ).data);
  }, { x: bounds.x + (plane.bounds.x + 10.5) * metrics.cellWidth, y });
  expect(pixel).toEqual([0, 0, 0, 255]);

  await page.evaluate(({ x, y }) => {
    const blocker = document.createElement("div");
    blocker.id = "hover-occluder";
    blocker.style.cssText = `position:fixed;left:${x - 5}px;top:${y - 5}px;width:20px;height:20px;z-index:99999`;
    document.body.append(blocker);
    window.dispatchEvent(new Event("resize"));
  }, { x, y });
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.evaluate(() => {
    document.getElementById("hover-occluder")!.remove();
    window.dispatchEvent(new Event("resize"));
  });
  await page.mouse.move(x + 1, y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "gallery-font-option-fusion-mono");
  await surface.focus();
  await page.keyboard.press("Escape");
  await expect(surface.getByRole("listbox")).toHaveCount(0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
});

test("hover shares hit testing, is paint-only, and never activates a command", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/#/__fixtures/core");
  const surface = page.locator('[data-cell-probe="core"]');
  const canvas = surface.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const metrics = await readCellMetrics(surface);
  const cellX = bounds.x + metrics.cellWidth;
  const cellY = bounds.y + metrics.cellHeight;
  const before = await readCellProbe(surface);
  await page.mouse.move(cellX + 15, cellY + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await expect(canvas).toHaveCSS("cursor", "pointer");
  const hovered = await readCellProbe(surface);
  expect(hovered.focusedId).toBe(before.focusedId);
  expect(hovered.text).toBe(before.text);
  expect(hovered.cells.find((cell) => cell.x === 20 && cell.y === 0)?.style.backgroundColor).toBe("rgb(0, 0, 0)");
  await page.mouse.move(cellX + 24, cellY + 9);
  const movedWithinTarget = await readCellProbe(surface);
  expect(movedWithinTarget.focusedId).toBe(before.focusedId);
  expect(movedWithinTarget.text).toBe(before.text);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await page.mouse.move(0, 0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await expect(canvas).toHaveCSS("cursor", "default");
  await canvas.dispatchEvent("pointermove", { pointerType: "touch", buttons: 0, clientX: cellX + 15, clientY: cellY + 9 });
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.mouse.move(cellX + 15, cellY + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await canvas.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" });
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.mouse.move(cellX + 24, cellY + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.mouse.click(cellX + 15, cellY + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await expect(surface).toHaveAttribute("data-cell-focused", "core-new");
});

test("palette blocks underlying hover even when the mouse is stationary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/__fixtures/overlay");
  const surface = page.locator('[data-cell-probe="overlay"]');
  const canvas = surface.locator("canvas").first();
  const metrics = await readCellMetrics(surface);
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 2.5 * metrics.cellWidth, bounds.y + 1.5 * metrics.cellHeight);
  await expect(surface).toHaveAttribute("data-cell-hovered", "show-palette");
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(surface.getByRole("dialog")).toHaveCount(1);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await expect(canvas).toHaveCSS("cursor", "default");
  await page.keyboard.press("Escape");
  await expect(surface).toHaveAttribute("data-cell-hovered", "show-palette");
});

test("stationary mouse follows scrolled rows and editor content keeps a neutral pointer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/__fixtures/core");
  const core = page.locator('[data-cell-probe="core"]');
  const canvas = core.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const metrics = await readCellMetrics(core);
  await page.mouse.move(bounds.x + 5 * metrics.cellWidth, bounds.y + 6.5 * metrics.cellHeight);
  await expect(core).toHaveAttribute("data-cell-hovered", "core-file-src/index.ts");
  await page.mouse.wheel(0, 100);
  await expect(core).toHaveAttribute("data-cell-hovered", "core-file-src/app.ts");
  await page.evaluate(() => { location.hash = "/__fixtures/editor"; });
  const editor = page.locator('[data-cell-probe="editor"] canvas');
  await expect(editor).toBeVisible();
  await editor.scrollIntoViewIfNeeded();
  const editorBounds = (await editor.boundingBox())!;
  const editorMetrics = await readCellMetrics(page.locator('[data-cell-probe="editor"]'));
  await page.mouse.move(editorBounds.x + 3 * editorMetrics.cellWidth, editorBounds.y + 2.5 * editorMetrics.cellHeight);
  await expect(editor).toHaveCSS("cursor", "default");
  await expect(page.locator('[data-cell-probe="editor"]')).not.toHaveAttribute("data-cell-hovered");
});
