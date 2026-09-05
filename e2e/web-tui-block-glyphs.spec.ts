import { expect, test } from "@playwright/test";

test("late font loading cannot change geometric thumb pixels", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\.(woff2?|ttf|otf)(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/exp/web-tui/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-cell-probe="core"] canvas');
  await expect(canvas).toBeVisible();
  const thumbPixels = () => canvas.evaluate((node: HTMLCanvasElement) => {
    const scale = devicePixelRatio;
    const left = Math.round(30 * 9 * scale);
    const top = Math.round(5 * 19 * scale);
    return Array.from(node.getContext("2d")!.getImageData(left, top,
      Math.round(31 * 9 * scale) - left, Math.round(7 * 19 * scale) - top).data);
  });
  const before = await thumbPixels();
  release();
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(await thumbPixels()).toEqual(before);
});

test("geometric blocks share exact pixel edges across scale and translation", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const results = await page.evaluate(async () => {
    const path = "/packages/rendering/src/canvas.ts";
    const { drawCharDeskCanvasCells } = await import(path);
    const results: boolean[] = [];
    for (const dpr of [1, 1.25, 2]) {
      for (const zoom of [1, 1.25]) {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0.2, 0.3);
        const entry = (text: string, y = 0) => ({
          cell: { text, width: 1, fontRoute: "text", color: "rgba(255,0,0,0.5)" },
          x: 0, y, options: { blockGlyphs: "geometry", clipToCell: true, zoom },
        });
        drawCharDeskCanvasCells(ctx, [entry("█"), entry("█", 19 * zoom)]);
        const width = Math.round(9 * zoom * dpr + 0.2);
        const height = Math.round(38 * zoom * dpr + 0.3);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        results.push(pixels.every((value, index) => index % 4 !== 3 || (value >= 127 && value <= 129)));
        results.push(ctx.getImageData(width, 0, 1, height).data.every((value) => value === 0));
        const full = canvas.toDataURL();
        // Repainting one Cell after a dirty clear must match a full paint.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, Math.round(19 * zoom * dpr + 0.3));
        ctx.restore();
        drawCharDeskCanvasCells(ctx, [entry("█")]);
        results.push(canvas.toDataURL() === full);
        ctx.clearRect(-1, -1, 128, 128);
        drawCharDeskCanvasCells(ctx, [entry("▀"), entry("▄")]);
        const halves = ctx.getImageData(0, 0, width, Math.round(19 * zoom * dpr + 0.3)).data;
        results.push(halves.every((value, index) => index % 4 !== 3 || (value >= 127 && value <= 129)));
        ctx.clearRect(-1, -1, 128, 128);
        drawCharDeskCanvasCells(ctx, [entry("▙"), entry("▝")]);
        const quarters = ctx.getImageData(0, 0, width, Math.round(19 * zoom * dpr + 0.3)).data;
        results.push(quarters.every((value, index) => index % 4 !== 3 || (value >= 127 && value <= 129)));
      }
    }
    return results;
  });
  expect(results.every(Boolean)).toBe(true);
});

for (const dpr of [1, 1.25, 2]) {
  test.describe(`Gallery block continuity DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("thumb has no font seam in either theme", async ({ page }) => {
      await page.goto("/exp/web-tui/");
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", colorScheme);
        const continuous = await page.locator('[data-cell-probe="core"]').evaluate((node) => {
          const probe = (node as HTMLElement & { __chardeskCellProbeV1: {
            cells: { text: string; x: number; y: number }[];
          } }).__chardeskCellProbeV1;
          const cells = probe.cells.filter((cell) => cell.text === "█");
          if (cells.length < 2) return false;
          const ctx = node.querySelector("canvas")!.getContext("2d")!;
          const scale = window.devicePixelRatio;
          const first = cells[0]!;
          const left = Math.round(first.x * 9 * scale);
          const top = Math.round(first.y * 19 * scale);
          const width = Math.round((first.x + 1) * 9 * scale) - left;
          const height = Math.round((first.y + cells.length) * 19 * scale) - top;
          const pixels = ctx.getImageData(left, top, width, height).data;
          return pixels.every((value, index) => value === pixels[index % 4]);
        });
        expect(continuous).toBe(true);
      }
    });
  });
}
