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

test("a large scroll presents newly visible rows in the scroll event, before another frame", async ({ page }) => {
  await page.goto("/#/guides/introduction");
  const surface = page.locator('[data-cell-probe="article-introduction"]');
  await expect(surface).toBeVisible();
  await readCellProbe(surface);

  const coverage = await page.evaluate(() => new Promise<{
    scrollY: number; covered: boolean; paintedRows: number;
  }>((resolve) => {
    document.addEventListener("scroll", () => {
      const article = document.querySelector<HTMLElement>('[data-cell-probe="article-introduction"]')!;
      const canvas = article.querySelector("canvas")!;
      const articleBounds = article.getBoundingClientRect();
      const paintBounds = canvas.getBoundingClientRect();
      const visibleTop = Math.max(0, articleBounds.top);
      const visibleBottom = Math.min(window.innerHeight, articleBounds.bottom);
      resolve({
        scrollY: window.scrollY,
        covered: paintBounds.top <= visibleTop + 1 && paintBounds.bottom >= visibleBottom - 1,
        paintedRows: canvas.height,
      });
    }, { once: true });
    window.scrollTo(0, 1_200);
  }));

  expect(coverage.scrollY).toBeGreaterThan(600);
  expect(coverage.covered).toBe(true);
  expect(coverage.paintedRows).toBeGreaterThan(0);
});

test("a clipping ancestor scroll presents the article before another frame", async ({ page }) => {
  await page.goto("/#/guides/introduction");
  const surface = page.locator('[data-cell-probe="article-introduction"]');
  await expect(surface).toBeVisible();
  await readCellProbe(surface);
  const dimensions = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".docs-page")!;
    scroller.style.display = "block";
    scroller.style.height = "360px";
    scroller.style.overflowY = "auto";
    return { clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight };
  });
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight + 600);

  const coverage = await page.evaluate(() => new Promise<{
    scrollTop: number; visible: boolean; covered: boolean;
  }>((resolve) => {
    const scroller = document.querySelector<HTMLElement>(".docs-page")!;
    scroller.addEventListener("scroll", () => {
      const article = document.querySelector<HTMLElement>('[data-cell-probe="article-introduction"]')!;
      const canvas = article.querySelector("canvas")!;
      const articleBounds = article.getBoundingClientRect();
      const clipBounds = scroller.getBoundingClientRect();
      const paintBounds = canvas.getBoundingClientRect();
      const visibleTop = Math.max(0, articleBounds.top, clipBounds.top);
      const visibleBottom = Math.min(window.innerHeight, articleBounds.bottom, clipBounds.bottom);
      resolve({
        scrollTop: scroller.scrollTop,
        visible: visibleBottom > visibleTop,
        covered: paintBounds.top <= visibleTop + 1 && paintBounds.bottom >= visibleBottom - 1,
      });
    }, { once: true });
    scroller.scrollTo(0, 900);
  }));

  expect(coverage.scrollTop).toBeGreaterThan(600);
  expect(coverage.visible).toBe(true);
  expect(coverage.covered).toBe(true);
});
