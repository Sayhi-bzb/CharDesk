import { expect, test } from "@playwright/test";
import { ownerBounds, ownerCells, readCellProbe, readCellMetrics } from "./helpers/cell-probe";

for (const dpr of [1, 2]) {
  test.describe(`Cell decoration at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("Tab decoration preserves Cell ownership and repaints consistently in both themes", async ({ page }) => {
      await page.goto("/#/__fixtures/complex");
      await page.evaluate(() => document.fonts.ready);
      const canvas = page.locator('[data-cell-probe="complex"] canvas');
      const surface = page.locator('[data-cell-probe="complex"]');
      for (const label of ["Code", "Preview", "Code"]) {
        await page.getByRole("tab", { name: label, exact: true }).evaluate((node: HTMLElement) => node.click());
        const probe = await readCellProbe(surface);
        const underline = ownerCells(probe, `tab-${label.toLowerCase()}`).filter(({ text }) => text === "▬");
        expect(underline).toHaveLength(12);
        expect(underline.every(({ text, ownerId }) => text === "▬" && ownerId === `tab-${label.toLowerCase()}`)).toBe(true);
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

test("real wheel stays inside ScrollArea, including at both boundaries", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto("/#/__fixtures/core");
  await page.evaluate(() => document.fonts.ready);
  const surface = page.locator('[data-cell-probe="core"]');
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const metrics = await readCellMetrics(surface);
  await page.mouse.move(bounds.x + 4 * metrics.cellWidth, bounds.y + 5.5 * metrics.cellHeight);
  const pageY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 1 / 3");
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 3 / 3");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("offset: 0 / 3");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  await page.mouse.move(5, 200);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageY);
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
