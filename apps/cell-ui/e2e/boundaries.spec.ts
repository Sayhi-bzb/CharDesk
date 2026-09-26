import { expect, test } from "@playwright/test";
import { canvasFor, cellPoint, ownerBounds, ownerCells, readCellProbe, readCellMetrics } from "./helpers/cell-probe";

for (const dpr of [1, 2]) {
  test.describe(`Cell decoration at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("Tab guards and underline preserve Cell ownership and repaint in both themes", async ({ page }) => {
      await page.goto("/#/__fixtures/complex");
      await page.evaluate(() => document.fonts.ready);
      const canvas = page.locator('[data-cell-probe="complex"] canvas');
      const surface = page.locator('[data-cell-probe="complex"]');
      for (const label of ["Code", "Preview", "Code"]) {
        await page.getByRole("tab", { name: label, exact: true }).evaluate((node: HTMLElement) => node.click());
        const probe = await readCellProbe(surface);
        const cells = ownerCells(probe, `tab-${label.toLowerCase()}`);
        const firstRow = Math.min(...cells.map(({ y }) => y));
        const guards = cells.filter(({ y, text }) => y === firstRow && text === " ");
        expect(guards).toHaveLength(2);
        expect(guards.every(({ style }) => style.backgroundColor === undefined)).toBe(true);
        expect(cells.filter(({ text }) => text === "⎺")).toHaveLength(label.length);
      }
      await page.getByRole("tab", { name: "Preview", exact: true }).evaluate((node: HTMLElement) => node.click());
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", colorScheme);
        const probe = await readCellProbe(surface);
        expect(probe.cells.find(({ x, y }) => x === 24 && y === 7)?.text).toBe(" ");
        const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
        await canvas.evaluate(async (node: HTMLCanvasElement) => {
          node.style.width = `${node.getBoundingClientRect().width + 1}px`;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(before);
      }
    });
  });
}

test("real wheel scrolls a Cell viewport first, then continues through the page at its boundary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto("/#/__fixtures/core");
  await page.evaluate(() => document.fonts.ready);
  const surface = page.locator('[data-cell-probe="core"]');
  const canvas = canvasFor(surface);
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const metrics = await readCellMetrics(surface);
  await page.mouse.move(bounds.x + 4 * metrics.cellWidth, bounds.y + 5.5 * metrics.cellHeight);
  const pageY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 1 / 3");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 3 / 3");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageY);
});

test("vertical wheel over a code block without vertical overflow scrolls the document", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto("/#/components/button");
  await page.locator("#usage").evaluate((element) => element.scrollIntoView({ block: "start" }));
  const article = page.locator('[data-cell-probe="article-button"]');
  const lines = (await readCellProbe(article)).text.split("\n");
  const codeY = lines.findIndex((line) => /\b1\s+import\b/u.test(line));
  expect(codeY).toBeGreaterThanOrEqual(0);
  const point = await cellPoint(article, 15, codeY);
  await page.mouse.move(point.x, point.y);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test("button confirmation does not freeze document scrolling over Cell content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto("/#/components/button");
  await page.locator("#usage").evaluate((element) => element.scrollIntoView({ block: "start" }));
  const article = page.locator('[data-cell-probe="article-button"]');
  const codeY = (await readCellProbe(article)).text.split("\n")
    .findIndex((line) => /\b1\s+import\b/u.test(line));
  expect(codeY).toBeGreaterThanOrEqual(0);
  const point = await cellPoint(article, 15, codeY);
  await article.getByRole("button", { name: "Show more" }).evaluate((element: HTMLElement) => element.click());
  await expect(article).toHaveAttribute("data-cell-activation-flash", /usage-toggle/u);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test("editor consumes its full layout width and paints blank focused Cells", async ({ page }) => {
  await page.goto("/#/__fixtures/editor");
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  const surface = page.locator('[data-cell-probe="editor"]');
  await input.fill("a".repeat(38));
  await input.fill("short");
  const probe = await readCellProbe(surface);
  const cells = ownerCells(probe, "editor-name");
  expect(ownerBounds(probe, "editor-name")).toEqual({ x: 0, y: 1, width: 40, height: 1 });
  expect(cells).toHaveLength(40);
  expect(cells.every((cell) => !!cell.style.backgroundColor)).toBe(true);
  expect(cells.map(({ text }) => text).join("")).toContain("short");
});
