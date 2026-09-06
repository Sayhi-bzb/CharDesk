import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`half-cell scrollbar DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("sub-cell drag produces half-block snapshots and continuous pixels", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/exp/web-tui/");
      const surface = page.locator('[data-cell-probe="core"]');
      const canvas = surface.locator("canvas");
      await canvas.scrollIntoViewIfNeeded();
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(bounds.x + 30.5 * 9, bounds.y + 5.1 * 19);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 30.5 * 9, bounds.y + 5.4 * 19);
      expect((await readCellProbe(surface)).text).toContain("offset: 0 / 3");
      await page.mouse.move(bounds.x + 30.5 * 9, bounds.y + 5.7 * 19);
      await page.mouse.up();
      await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 1 / 3");
      const probe = await readCellProbe(surface);
      expect(probe.cells.filter((cell) => cell.x === 30 && cell.y >= 5 && cell.y <= 8).map((cell) => cell.text))
        .toEqual(["▄", "█", "▀", " "]);
      await page.evaluate(() => document.fonts.ready);
      const continuous = await canvas.evaluate((node) => {
        const scale = devicePixelRatio;
        const x = Math.round(30 * 9 * scale);
        const width = Math.round(31 * 9 * scale) - x;
        const y = Math.round(5.5 * 19 * scale);
        const end = Math.round(7.5 * 19 * scale);
        const ctx = node.getContext("2d")!;
        const pixels = ctx.getImageData(x, y, width, end - y).data;
        const outside = ctx.getImageData(x, Math.round(5.2 * 19 * scale), 1, 1).data;
        return pixels.every((value, index) => value === pixels[index % 4])
          && pixels[0] !== outside[0];
      });
      expect(continuous).toBe(true);
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
