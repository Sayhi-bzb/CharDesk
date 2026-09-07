import { expect, test } from "@playwright/test";
import { readCellProbe, readCellMetrics } from "./helpers/cell-probe";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`half-cell scrollbar DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("sub-cell drag produces Unicode half-block snapshots and stable repaint", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/exp/web-tui/#/__fixtures/all");
      const surface = page.locator('[data-cell-probe="core"]');
      const canvas = surface.locator("canvas");
      await canvas.scrollIntoViewIfNeeded();
      const { cellWidth, cellHeight } = await readCellMetrics(surface);
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(bounds.x + 30.5 * cellWidth, bounds.y + 5.1 * cellHeight);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 30.5 * cellWidth, bounds.y + 5.4 * cellHeight);
      expect((await readCellProbe(surface)).text).toContain("offset: 0 / 3");
      await page.mouse.move(bounds.x + 30.5 * cellWidth, bounds.y + 5.7 * cellHeight);
      await page.mouse.up();
      await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 1 / 3");
      const probe = await readCellProbe(surface);
      const thumbCells = probe.cells.filter((cell) => cell.x === 30 && cell.y >= 5 && cell.y <= 8);
      expect(thumbCells.map((cell) => cell.text)).toEqual(["▄", "█", "▀", " "]);
      expect(thumbCells.slice(0, 3).every((cell) => cell.width === 1 && !cell.continuation)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      const before = await canvas.evaluate((node) => node.toDataURL());
      await canvas.evaluate(async (node) => {
        node.style.width = `${node.getBoundingClientRect().width + 1}px`;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      expect(await canvas.evaluate((node) => node.toDataURL())).toBe(before);
    });
  });
}
