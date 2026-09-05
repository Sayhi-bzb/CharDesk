import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("hover shares hit testing, is paint-only, and never activates a command", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/");
  const surface = page.locator('[data-cell-probe="core"]');
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const before = await readCellProbe(surface);
  await page.mouse.move(bounds.x + 15, bounds.y + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "core-new");
  await expect(canvas).toHaveCSS("cursor", "pointer");
  const hovered = await readCellProbe(surface);
  expect(hovered.focusedId).toBe(before.focusedId);
  expect(hovered.text).toBe(before.text);
  expect(hovered.cells.find((cell) => cell.x === 20 && cell.y === 0)?.style.backgroundColor).toBe("rgb(232, 232, 232)");
  await page.mouse.move(bounds.x + 24, bounds.y + 9);
  expect((await readCellProbe(surface)).revision).toBe(hovered.revision);
  await page.mouse.move(0, 0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await expect(canvas).toHaveCSS("cursor", "default");
});

test("palette blocks underlying hover even when the mouse is stationary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/");
  const surface = page.locator('[data-cell-probe="overlay"]');
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 15, bounds.y + 9);
  await expect(surface).toHaveAttribute("data-cell-hovered", "show-palette");
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(surface.getByRole("dialog")).toHaveCount(1);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await expect(canvas).toHaveCSS("cursor", "default");
  await page.keyboard.press("Escape");
  await expect(surface).toHaveAttribute("data-cell-hovered", "show-palette");
});
