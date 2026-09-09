import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Nerd glyphs keep their aspect ratio while retaining one Cell", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const raster = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const { drawCharDeskCanvasCells, loadCharDeskCanvasFonts } = await import(rendererPath);
    const availability = await loadCharDeskCanvasFonts(["󰄳"]);
    const { resolveCharDeskCellVisual } = await import(modelPath);
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 30;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "12px 'Symbols Nerd Font Mono'";
    const advance = ctx.measureText("󰄳").width;
    const cell = resolveCharDeskCellVisual({ text: "󰄳", color: "black" });
    drawCharDeskCanvasCells(ctx, [{ cell, x: 18, y: 5, drawBackground: false }]);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let outside = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (x < 18 || x >= 27) outside += 1;
    }
    return {
      cells: cell.width,
      loaded: availability.text,
      fontReady: document.fonts.check("12px 'Symbols Nerd Font Mono'", "󰄳"),
      advance,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      outside,
    };
  });

  expect(raster.cells).toBe(1);
  expect(raster.loaded).toBe(true);
  expect(raster.fontReady).toBe(true);
  expect(raster.advance).toBeCloseTo(12, 0);
  expect(raster.width).toBeGreaterThanOrEqual(10);
  expect(raster.width).toBeLessThanOrEqual(13);
  expect(Math.abs(raster.width - raster.height)).toBeLessThanOrEqual(2);
  expect(raster.outside).toBeGreaterThan(0);
});

test("font ink crosses its Cell boundary without changing allocation", async ({ page }) => {
  await page.goto("/exp/web-tui/");
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
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.evaluate(() => document.fonts.ready);
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "Document", exact: true });
  await input.fill("→W█▀│".repeat(30));
  await input.press("Home");
  await input.fill("");
  const overlay = page.locator('[data-cell-probe="overlay"]');
  await overlay.focus(); await page.keyboard.press("Enter");
  await expect(overlay.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  for (const surface of [editor, overlay]) {
    expect((await readCellProbe(surface)).presentation?.glyphInkOverhang).toBeDefined();
    const canvas = surface.locator("canvas");
    const before = await canvas.evaluate((node) => node.toDataURL());
    await canvas.evaluate(async (node) => {
      node.style.width = `${node.getBoundingClientRect().width + 1}px`;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    });
    expect(await canvas.evaluate((node) => node.toDataURL())).toBe(before);
  }
});
