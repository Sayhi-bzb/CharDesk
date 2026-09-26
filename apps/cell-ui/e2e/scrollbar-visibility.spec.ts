import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

test("ScrollArea rails appear on hover and scrolling, then hide without moving content", async ({ page }) => {
  await page.goto("/#/__fixtures/core");
  const surface = page.locator('[data-cell-probe="core"]');
  const rail = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "core-files" && cell.x === 30 && cell.y >= 5 && cell.y <= 8)
    .map((cell) => cell.text);
  await expect.poll(rail).toEqual([" ", " ", " ", " "]);
  const before = await readCellProbe(surface);
  const content = await cellPoint(surface, 10, 6);
  await page.mouse.move(content.x, content.y);
  await expect.poll(async () => (await rail()).some((glyph) => glyph !== " ")).toBe(true);
  const hovered = await readCellProbe(surface);
  expect(hovered.text).toContain("offset: 0 / 3");
  await page.mouse.move(0, 0);
  await expect.poll(rail).toEqual([" ", " ", " ", " "]);
  await page.mouse.move(content.x, content.y);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 1 / 3");
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await rail()).some((glyph) => glyph !== " ")).toBe(true);
  await expect.poll(rail, { timeout: 3000 }).toEqual([" ", " ", " ", " "]);
  expect((await readCellProbe(surface)).viewport).toEqual(before.viewport);
});
