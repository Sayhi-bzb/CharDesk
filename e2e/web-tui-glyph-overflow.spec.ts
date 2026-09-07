import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("unclipped font ink crosses a Cell boundary while clipped ink stays inside", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const ink = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const { drawCharDeskCanvasCells } = await import(rendererPath);
    const { resolveCharDeskCellVisual } = await import(modelPath);
    const canvas = document.createElement("canvas");
    canvas.width = 80; canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    const sample = (clipToCell: boolean) => {
      ctx.clearRect(0, 0, 80, 40);
      drawCharDeskCanvasCells(ctx, [{
        cell: resolveCharDeskCellVisual({ text: "W", color: "black" }), x: 30, y: 0,
        drawBackground: false,
        options: { clipToCell, metrics: { cellWidth: 4, cellHeight: 40, fontSize: 30, fontFamily: "monospace" } },
      }]);
      const pixels = ctx.getImageData(0, 0, 80, 40).data;
      let outside = 0;
      for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) {
        if ((x < 30 || x >= 34) && pixels[(y * 80 + x) * 4 + 3] > 0) outside++;
      }
      return outside;
    };
    return { clipped: sample(true), visible: sample(false) };
  });
  expect(ink.clipped).toBe(0);
  expect(ink.visible).toBeGreaterThan(0);
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
    expect((await readCellProbe(surface)).presentation?.glyphOverflowMode).toBe("visible");
    const canvas = surface.locator("canvas");
    const before = await canvas.evaluate((node) => node.toDataURL());
    await canvas.evaluate(async (node) => {
      node.style.width = `${node.getBoundingClientRect().width + 1}px`;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    });
    expect(await canvas.evaluate((node) => node.toDataURL())).toBe(before);
  }
});
