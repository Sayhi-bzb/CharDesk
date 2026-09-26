import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

test("long articles keep one logical Cell page while Canvas follows the visible rows", async ({ page }) => {
  await page.goto("/#/guides/introduction");
  const surface = page.locator('[data-cell-probe="article-introduction"]');
  await expect(surface).toBeVisible();
  const initial = await readCellProbe(surface);
  expect(initial.text).toContain("Show progress in text");

  for (const scrollY of [0, 600, 1_200, 600, 0]) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await expect.poll(async () => surface.evaluate((element) => {
      const canvas = element.querySelector("canvas")!;
      const pageBounds = element.getBoundingClientRect();
      const paintBounds = canvas.getBoundingClientRect();
      const visibleTop = Math.max(0, pageBounds.top);
      const visibleBottom = Math.min(window.innerHeight, pageBounds.bottom);
      return visibleBottom <= visibleTop || (paintBounds.top <= visibleTop + 1
        && paintBounds.bottom >= visibleBottom - 1);
    })).toBe(true);
    const canvasBytes = await page.evaluate(() => [...document.querySelectorAll("canvas")]
      .reduce((bytes, canvas) => bytes + canvas.width * canvas.height * 4, 0));
    expect(canvasBytes).toBeLessThan(20 * 1_048_576);
  }
  const after = await readCellProbe(surface);
  expect(after.text).toBe(initial.text);
  expect(after.viewport).toEqual(initial.viewport);
});
