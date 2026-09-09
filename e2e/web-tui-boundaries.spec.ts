import { expect, test } from "@playwright/test";
import { readCellProbe, readCellMetrics } from "./helpers/cell-probe";

for (const dpr of [1, 2]) {
  test.describe(`Cell decoration at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("Tab decoration preserves Cell ownership and repaints consistently in both themes", async ({ page }) => {
      await page.goto("/exp/web-tui/#/__fixtures/all");
      await page.evaluate(() => document.fonts.ready);
      const canvas = page.locator('[data-cell-probe="complex"] canvas');
      const surface = page.locator('[data-cell-probe="complex"]');
      for (const label of ["Code", "Preview", "Code"]) {
        await page.getByRole("tab", { name: label, exact: true }).evaluate((node: HTMLElement) => node.click());
        const probe = await readCellProbe(surface);
        const start = label === "Code" ? 0 : 12;
        const underline = probe.cells.filter(({ x, y }) => y === 7 && x >= start && x < start + 12);
        expect(underline).toHaveLength(12);
        expect(underline.every(({ text, ownerId }) => text === "▬" && ownerId === `tab-${label.toLowerCase()}`)).toBe(true);
      }
      await page.getByRole("tab", { name: "Preview", exact: true }).evaluate((node: HTMLElement) => node.click());
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", colorScheme);
        const probe = await readCellProbe(surface);
        expect(probe.presentation?.glyphOverflowMode).toBe("visible");
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
  await page.goto("/exp/web-tui/#/__fixtures/all");
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
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  const surface = page.locator('[data-cell-probe="editor"]');
  await input.fill("a".repeat(37));
  await expect.poll(async () => (await readCellProbe(surface)).text.split("\n")[2])
    .toBe(`│${"a".repeat(37)} │`);
  await input.fill("a".repeat(38));
  expect((await readCellProbe(surface)).text.split("\n")[2]).toBe(`│${"a".repeat(37)} │`);
  await input.fill("short");
  const cells = await surface.evaluate((node) => {
    const probe = (node as HTMLElement & { __chardeskCellProbeV4: {
      cells: { x: number; y: number; style: { backgroundColor?: string }; ownerId: string | null }[];
    } }).__chardeskCellProbeV4;
    return probe.cells.filter(({ y }) => y >= 1 && y <= 3);
  });
  expect(cells).toHaveLength(120);
  expect(cells.every((cell) => cell.ownerId === "editor-name" && !!cell.style.backgroundColor)).toBe(true);
});
