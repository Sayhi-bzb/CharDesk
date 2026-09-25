import { expect, test, type Locator } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`Surface guard at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("shows both leading Markdown task glyphs without changing Cells", async ({ page }) => {
      await page.goto("/#/guides/markdown");
      const surface = page.getByLabel("Markdown example");
      const probe = await readCellProbe(surface);
      expect(probe.text).toContain("☑ Build UI");
      expect(probe.text).toContain("☐ Share it");
      const metrics = probe.presentation!.metrics;
      const canvas = surface.locator("canvas").first();
      await expect(canvas).toHaveCSS("width", `${(probe.viewport.width + 2) * metrics.cellWidth}px`);
      await page.evaluate(() => document.fonts.ready);
      for (const glyph of ["☑", "☐"]) {
        const marker = probe.cells.find((cell) => cell.text === glyph);
        expect(marker).toMatchObject({ x: 0 });
        const readInk = () => canvas.evaluate((element, { row, metrics }) => {
          const context = element.getContext("2d")!;
          const dpr = devicePixelRatio;
          const width = Math.round(metrics.cellWidth * dpr);
          const height = Math.round(metrics.cellHeight * dpr);
          const left = context.getImageData(0, Math.round((row + 1) * metrics.cellHeight * dpr),
            width, height).data;
          let pixels = 0;
          let firstX = width;
          for (let index = 0; index < left.length; index += 4) {
            if (left[index]! >= 128 || left[index + 1]! >= 128 || left[index + 2]! >= 128) continue;
            pixels += 1;
            firstX = Math.min(firstX, (index / 4) % width);
          }
          return { pixels, firstX };
        }, { row: marker!.y, metrics });
        await expect.poll(async () => (await readInk()).pixels).toBeGreaterThan(0);
        const ink = await readInk();
        expect(ink.firstX).toBeGreaterThan(0);
      }
    });
  });
}

for (const dpr of [1, 1.25, 2]) {
  test.describe(`NF icon ink at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("keeps full-size ink and aligns with display capitals across icon families", async ({ page }) => {
      await page.goto("/");
      const raster = await page.evaluate(async () => {
        const rendererPath = "/packages/rendering/src/canvas.ts";
        const modelPath = "/packages/rendering/src/index.ts";
        const maplePath = "/packages/font-maple/src/index.ts";
        const { drawCharDeskCanvasCells, loadCharDeskCanvasFonts } = await import(rendererPath);
        const { MAPLE_FONT_PROFILE } = await import(maplePath);
        const icons = ["\uEB4B", "\uF0C7", "󰄳"];
        const availability = await loadCharDeskCanvasFonts([...icons, "H"], { fontProfile: MAPLE_FONT_PROFILE });
        await document.fonts.load("15px 'Maple Mono NF CN'", "H");
        const { resolveCharDeskCellVisual } = await import(modelPath);
        const canvas = document.createElement("canvas");
        const dpr = devicePixelRatio;
        canvas.width = 48 * dpr;
        canvas.height = 30 * dpr;
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const bounds = (text: string) => {
          ctx.clearRect(0, 0, 48, 30);
          const cell = resolveCharDeskCellVisual({ text, color: "black" });
          drawCharDeskCanvasCells(ctx, [{ cell, x: 18, y: 5, drawBackground: false,
            options: { fontProfile: MAPLE_FONT_PROFILE } }]);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, outside = 0;
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            if (x + 0.5 < 18 * dpr || x + 0.5 >= 27 * dpr) outside += 1;
          }
          return { cells: cell.width, width: (maxX - minX + 1) / dpr,
            height: (maxY - minY + 1) / dpr, centerY: (minY + maxY + 1) / (2 * dpr), outside };
        };
        const capital = bounds("H");
        return {
          loaded: availability.text,
          capital,
          icons: icons.map((icon) => ({ icon, ...bounds(icon),
            fontReady: document.fonts.check("12px 'Symbols Nerd Font Mono'", icon) })),
        };
      });

      expect(raster.loaded).toBe(true);
      for (const icon of raster.icons) {
        expect(icon.cells).toBe(1);
        expect(icon.fontReady).toBe(true);
        expect(icon.width).toBeGreaterThan(0);
        expect(Math.abs(icon.centerY - raster.capital.centerY)).toBeLessThanOrEqual(1.5);
      }
      const save = raster.icons.find((icon) => icon.icon === "\uEB4B")!;
      expect(save.width).toBeGreaterThanOrEqual(10);
      expect(save.width).toBeLessThanOrEqual(13);
      expect(save.outside).toBeGreaterThan(0);
    });
  });
}

test("font ink crosses its Cell boundary without changing allocation", async ({ page }) => {
  await page.goto("/");
  const ink = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const { drawCharDeskCanvasCells } = await import(rendererPath);
    const { resolveCharDeskCellVisual } = await import(modelPath);
    const canvas = document.createElement("canvas");
    canvas.width = 80; canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    drawCharDeskCanvasCells(ctx, [{
      cell: resolveCharDeskCellVisual({ text: "W", color: "black" }), x: 30, y: 0,
      drawBackground: false,
      options: { metrics: { cellWidth: 4, cellHeight: 40, fontSize: 30, fontFamily: "monospace" } },
    }]);
    const pixels = ctx.getImageData(0, 0, 80, 40).data;
    let outside = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) {
      if ((x < 30 || x >= 34) && pixels[(y * 80 + x) * 4 + 3] > 0) outside++;
    }
    return outside;
  });
  expect(ink).toBeGreaterThan(0);
});

test("Gallery clears old ink after replacement, scrolling and closing an overlay", async ({ page }) => {
  const assertStableRepaint = async (surface: Locator) => {
    expect((await readCellProbe(surface)).presentation?.glyphInkOverhang).toBeDefined();
    const canvas = surface.locator("canvas").first();
    const before = await canvas.evaluate((node) => node.toDataURL());
    await canvas.evaluate(async (node) => {
      node.style.width = `${node.getBoundingClientRect().width + 1}px`;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    });
    expect(await canvas.evaluate((node) => node.toDataURL())).toBe(before);
  };

  await page.goto("/#/__fixtures/editor");
  await page.evaluate(() => document.fonts.ready);
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "Document", exact: true });
  await input.fill("→W█▀│".repeat(30));
  await input.press("Home");
  await input.fill("");
  await assertStableRepaint(editor);

  await page.evaluate(() => { location.hash = "/__fixtures/overlay"; });
  const overlay = page.locator('[data-cell-probe="overlay"]');
  await expect(overlay).toBeVisible();
  await overlay.focus(); await page.keyboard.press("Enter");
  await expect(overlay.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await assertStableRepaint(overlay);
});
