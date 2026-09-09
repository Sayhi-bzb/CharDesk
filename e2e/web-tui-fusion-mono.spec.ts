import { expect, test } from "@playwright/test";
import { fusionMonoBase64 } from "./helpers/fusion-mono";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`real Fusion Mono raster DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("keeps fractional spacing while overpainting bold", async ({ page }, testInfo) => {
      await page.goto("/exp/web-tui/");
      const result = await page.evaluate(async (base64) => {
        const rendererPath = "/packages/rendering/src/canvas.ts";
        const modelPath = "/packages/rendering/src/index.ts";
        const profilesPath = "/exp/web-tui/font-options.ts";
        const { drawCharDeskCanvasCells, measureCharDeskCanvasFont, prepareCharDeskCanvasSurface } = await import(rendererPath);
        const { resolveCharDeskCellVisual } = await import(modelPath);
        const { galleryFontOptions } = await import(profilesPath);
        const face = new FontFace("Fusion Pixel 12px Mono latin", `url(data:font/woff2;base64,${base64})`, { weight: "400" });
        document.fonts.add(await face.load());
        const profile = galleryFontOptions["fusion-mono"].profile;
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
            options: { metrics, fontProfile: profile },
          })));
          return canvas.toDataURL();
        };
        const regular = draw(false);
        const requestedBold = draw(true);
        return { metrics, calls, regular, requestedBold, loaded: face.status };
      }, fusionMonoBase64);
      expect(result.loaded).toBe("loaded");
      expect(result.metrics.cellWidth).toBeCloseTo(7.5, 5);
      const regularCalls = result.calls.slice(0, 10);
      const boldCalls = result.calls.slice(10);
      expect(regularCalls).toHaveLength(10);
      expect(boldCalls).toHaveLength(20);
      for (const [index, call] of regularCalls.entries()) {
        expect(call.x).toBeCloseTo((index + 0.5) * 7.5, 5);
        expect(call.y).toBeCloseTo(result.metrics.baseline, 5);
        expect(call.font).not.toContain("700");
        expect(call.advance).toBeCloseTo(7.5, 5);
        expect(call.ink).toBeGreaterThan(0);
        // WebKit's reported regular ink bounds can occupy the full advance.
        expect(call.ink).toBeLessThanOrEqual(call.advance);
      }
      for (let index = 0; index < 10; index += 1) {
        const anchor = (index + 0.5) * 7.5;
        expect(boldCalls[index * 2]!.x).toBeCloseTo(anchor, 5);
        expect(boldCalls[index * 2 + 1]!.x).toBeCloseTo(anchor + 1, 5);
        for (const call of boldCalls.slice(index * 2, index * 2 + 2)) {
          expect(call.y).toBeCloseTo(result.metrics.baseline, 5);
          expect(call.font).not.toContain("700");
          expect(call.advance).toBeCloseTo(7.5, 5);
        }
      }
      expect(result.requestedBold).not.toBe(result.regular);
      await testInfo.attach("fusion-mono-raster", { body: Buffer.from(result.regular.split(",")[1]!, "base64"), contentType: "image/png" });
      await testInfo.attach("fusion-mono-overdraw-raster", { body: Buffer.from(result.requestedBold.split(",")[1]!, "base64"), contentType: "image/png" });
      await testInfo.attach("fusion-mono-measurements", { body: JSON.stringify({ metrics: result.metrics, calls: result.calls }), contentType: "application/json" });
    });
  });
}
