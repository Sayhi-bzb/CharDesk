import { expect, test } from "@playwright/test";
import { ownerBounds, ownerCells, readCellProbe, readCellPixel } from "./helpers/cell-probe";

test("editor blur clears the full focus surface and caret but preserves logical state", async ({ page }) => {
  await page.goto("/#/__fixtures/editor");
  const surface = page.locator('[data-cell-probe="editor"]');
  const editor = page.getByRole("textbox", { name: "Document", exact: true });
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  const idle = await readCellProbe(surface);
  await editor.fill("");
  const active = await readCellProbe(surface);
  const area = ownerBounds(active, "editor-document");
  const blank = ownerCells(active, "editor-document").find((cell) =>
    cell.x === area.x + 10 && cell.y === area.y + area.height - 2
    && cell.text === " ")!;
  const idleBackground = idle.cells.find((cell) => cell.x === blank.x && cell.y === blank.y)
    ?.style.backgroundColor;
  expect(blank.style.backgroundColor).toBeTruthy();
  const canvas = surface.locator("canvas");
  const caretPixel = () => readCellPixel(surface, blank.x + 0.5, blank.y + 0.5);
  const focusedPixel = await caretPixel();
  await editor.evaluate((input) => input.blur());
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await expect.poll(async () => (await readCellProbe(surface)).cells
    .find((cell) => cell.x === blank.x && cell.y === blank.y)?.style.backgroundColor)
    .not.toBe(blank.style.backgroundColor);
  const blurred = await readCellProbe(surface);
  expect(blurred.cells.find((cell) => cell.x === blank.x && cell.y === blank.y)
    ?.style.backgroundColor).toBe(idleBackground);
  expect(blurred.focusedId).toBe(active.focusedId);
  expect(blurred.text).toBe(active.text);
  expect(await caretPixel()).not.toEqual(focusedPixel);
  // Force a full Canvas presentation: it must match the blur's incremental erase.
  const erased = await canvas.evaluate((canvas) => canvas.toDataURL());
  await page.setViewportSize({ width: 1201, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await canvas.evaluate((canvas) => canvas.toDataURL())).toBe(erased);
  await editor.focus();
  await expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
  expect(await caretPixel()).toEqual(focusedPixel);
  await editor.press("x");
  await expect(editor).toHaveValue("x");
  await page.getByRole("heading", { name: "Cell UI Fixture", exact: true }).click();
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  expect((await readCellProbe(surface)).focusedId).toBe(active.focusedId);
});

test("only the active Surface paints focus, while selected state survives", async ({ page }) => {
  await page.goto("/#/__fixtures/core");
  const core = page.locator('[data-cell-probe="core"]');
  await core.focus();
  const active = await readCellProbe(core);
  expect(active.cells.some((cell) => cell.ownerId === "core-open"
    && !cell.style.bold && !!cell.style.backgroundColor)).toBe(true);
  const outside = page.getByRole("button", { name: /^(Dark|Light)$/ });
  await outside.focus();
  await expect(core).not.toHaveAttribute("data-cell-focus-visible");
  const blurred = await readCellProbe(core);
  const blurredOpenCells = blurred.cells.filter((cell) => cell.ownerId === "core-open");
  expect(blurred.focusedId).toBe(active.focusedId);
  expect(blurredOpenCells.some((cell) => cell.style.bold)).toBe(false);
  expect(blurredOpenCells.length).toBeGreaterThan(0);
  expect(blurredOpenCells.every((cell) => cell.style.backgroundColor === undefined)).toBe(true);
  expect(active.cells.some((cell) => cell.ownerId === "core-open"
    && cell.style.backgroundColor !== undefined)).toBe(true);
  expect(blurred.text).toContain("✓ Open file");
  await expect(page.locator('[data-cell-probe][data-cell-focus-visible="true"]')).toHaveCount(1);
  await expect(page.locator('[data-cell-probe="gallery-header"]')).toHaveAttribute("data-cell-focus-visible", "true");
  await core.focus();
  expect((await readCellProbe(core)).focusedId).toBe(active.focusedId);
  await page.keyboard.press("Enter");
  await expect(core).toHaveAttribute("data-cell-focused", "core-open");
});

test("window focus recovery checks current ownership and never steals an external focus", async ({ page }) => {
  await page.goto("/#/__fixtures/editor");
  const surface = page.locator('[data-cell-probe="editor"]');
  const editor = page.getByRole("textbox", { name: "Document", exact: true });
  await editor.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const outside = page.getByRole("button", { name: /^(Dark|Light)$/ });
  await outside.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await expect(outside).toBeFocused();
});
