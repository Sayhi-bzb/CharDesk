import { expect, test } from "@playwright/test";
import { readCellMetrics, readCellPixel, readCellProbe } from "./helpers/cell-probe";

test("inverse cursor follows committed editor colors, wide glyphs, movement and theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="editor"]');
  const input = surface.getByRole("textbox", { name: "File name", exact: true });
  const canvas = surface.locator("canvas");
  await input.fill("");
  await canvas.scrollIntoViewIfNeeded();
  const metrics = await readCellMetrics(surface);
  const corner = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "editor-name" && cell.text === "┌")!;
  const x = corner.x + 1;
  const y = corner.y + 1;
  const pixel = (offset = 0) => readCellPixel(surface, x + offset + 0.1, y + 0.1);
  await expect.poll(() => pixel()).toEqual([255, 255, 255, 255]);

  // Actual pointer entry must show the same inverse cursor before any key event.
  await page.getByRole("heading", { name: "Cell UI Fixtures", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + (x + 0.5) * metrics.cellWidth, bounds.y + (y + 0.5) * metrics.cellHeight);
  await expect(input).toBeFocused();
  await expect.poll(() => pixel()).toEqual([255, 255, 255, 255]);
  await input.fill("中A");
  await input.press("Home");
  await expect.poll(() => pixel()).toEqual([255, 255, 255, 255]);
  expect(await pixel(1)).toEqual([255, 255, 255, 255]);
  const wideText = (await readCellProbe(surface)).text;
  await input.press("ArrowRight");
  await expect.poll(() => pixel()).toEqual([0, 0, 0, 255]);
  expect(await pixel(2)).toEqual([255, 255, 255, 255]);
  expect((await readCellProbe(surface)).text).toBe(wideText);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect.poll(() => pixel(2)).toEqual([0, 0, 0, 255]);
  expect(await pixel()).toEqual([255, 255, 255, 255]);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--cell-highlight", "rgb(30, 40, 50)");
    document.documentElement.style.setProperty("--cell-highlight-foreground", "rgb(210, 220, 230)");
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect.poll(() => pixel(2)).toEqual([210, 220, 230, 255]);
  expect(await pixel()).toEqual([30, 40, 50, 255]);
  await input.press("Shift+ArrowLeft");
  await expect.poll(() => pixel()).toEqual([255, 255, 255, 255]);
  expect((await readCellProbe(surface)).cells.find((cell) => cell.x === x && cell.y === y)?.style)
    .toMatchObject({ color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 0, 0)" });
  await input.evaluate((element) => element.blur());
  await expect.poll(() => pixel(2)).toEqual([255, 255, 255, 255]);
  expect((await readCellProbe(surface)).text).toBe(wideText);
  await input.fill("x".repeat(80));
  await expect.poll(() => pixel(37)).toEqual([210, 220, 230, 255]);
  await input.press("Home");
  await expect.poll(() => pixel()).toEqual([210, 220, 230, 255]);
  expect(await pixel(37)).toEqual([30, 40, 50, 255]);
});

test("cursor blink restores current pixels without changing character snapshots", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="editor"]');
  const input = surface.getByRole("textbox", { name: "File name", exact: true });
  await input.fill("");
  await readCellMetrics(surface);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await input.evaluate((element) => element.blur());
  await input.focus();
  const pixel = () => readCellPixel(surface, 1.1, 2.1);
  await expect.poll(pixel, { intervals: [25] }).toEqual([255, 255, 255, 255]);
  const before = await readCellProbe(surface);
  await expect.poll(pixel, { intervals: [25] }).toEqual([0, 0, 0, 255]);
  expect((await readCellProbe(surface)).text).toBe(before.text);
  expect((await readCellProbe(surface)).revision).toBe(before.revision);
  await expect.poll(pixel, { intervals: [25] }).toEqual([255, 255, 255, 255]);
  await input.fill("A");
  const movedPixel = () => readCellPixel(surface, 2.1, 2.1);
  await expect.poll(movedPixel, { intervals: [25] }).toEqual([255, 255, 255, 255]);
  const updated = await readCellProbe(surface);
  await expect.poll(movedPixel, { intervals: [25] }).toEqual([0, 0, 0, 255]);
  expect((await readCellProbe(surface)).text).toBe(updated.text);
  expect(await pixel()).toEqual([0, 0, 0, 255]);
});
