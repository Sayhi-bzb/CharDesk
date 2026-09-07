import { expect, test } from "@playwright/test";
import { arkMonoBase64 } from "./helpers/ark-mono";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`real Ark Mono raster DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("keeps fractional spacing and declines synthetic bold", async ({ page }, testInfo) => {
      await page.goto("/exp/web-tui/");
      const result = await page.evaluate(async (base64) => {
        const rendererPath = "/packages/rendering/src/canvas.ts";
        const modelPath = "/packages/rendering/src/index.ts";
        const profilesPath = "/exp/web-tui/font-options.ts";
        const { drawCharDeskCanvasCells, measureCharDeskCanvasFont, prepareCharDeskCanvasSurface } = await import(rendererPath);
        const { resolveCharDeskCellVisual } = await import(modelPath);
        const { galleryFontOptions } = await import(profilesPath);
        const face = new FontFace("Ark Pixel 12px Mono latin", `url(data:font/woff2;base64,${base64})`, { weight: "400" });
        document.fonts.add(await face.load());
        const profile = galleryFontOptions["ark-mono"].profile;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const { metrics } = measureCharDeskCanvasFont(ctx, profile, 15);
        prepareCharDeskCanvasSurface(canvas, ctx, 120, 30, devicePixelRatio);
        const nativeFillText = ctx.fillText.bind(ctx);
        const calls: { x: number; y: number; font: string; advance: number; ink: number }[] = [];
        ctx.fillText = (text, x, y) => {
          const bounds = ctx.measureText(text);
          calls.push({ x, y, font: ctx.font, advance: bounds.width,
            ink: bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight });
          nativeFillText(text, x, y);
        };
        const draw = (bold: boolean) => {
          ctx.clearRect(0, 0, 120, 30);
          drawCharDeskCanvasCells(ctx, Array.from("0iMWm0iMWm", (text, column) => ({
            cell: resolveCharDeskCellVisual({ text, color: "black", attrs: { bold } }),
            x: column * metrics.cellWidth, y: 0, drawBackground: false,
            options: { metrics, fontProfile: profile, clipToCell: false },
          })));
          return canvas.toDataURL();
        };
        const regular = draw(false);
        const requestedBold = draw(true);
        return { metrics, calls, regular, requestedBold, loaded: face.status };
      }, arkMonoBase64);
      expect(result.loaded).toBe("loaded");
      expect(result.metrics.cellWidth).toBeCloseTo(7.5, 5);
      expect(result.calls).toHaveLength(20);
      for (const [index, call] of result.calls.entries()) {
        expect(call.x).toBeCloseTo(((index % 10) + 0.5) * 7.5, 5);
        expect(call.y).toBeCloseTo(result.metrics.baseline, 5);
        expect(call.font).not.toContain("700");
        expect(call.advance).toBeCloseTo(7.5, 5);
        expect(call.ink).toBeGreaterThan(0);
        // WebKit's reported regular ink bounds can occupy the full advance.
        expect(call.ink).toBeLessThanOrEqual(call.advance);
      }
      expect(result.requestedBold).toBe(result.regular);
      await testInfo.attach("ark-mono-raster", { body: Buffer.from(result.regular.split(",")[1]!, "base64"), contentType: "image/png" });
      await testInfo.attach("ark-mono-measurements", { body: JSON.stringify({ metrics: result.metrics, calls: result.calls }), contentType: "application/json" });
    });
  });
}
