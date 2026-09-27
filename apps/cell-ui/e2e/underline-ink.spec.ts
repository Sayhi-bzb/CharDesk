import { expect, test } from "@playwright/test";

for (const dpr of [1, 2]) {
  test.describe(`CJK underline ink at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test("keeps the underline below the glyph and inside its Cell row", async ({ page }) => {
      await page.goto("/");
      const rows = await page.evaluate(async () => {
        const rendererPath = "/packages/rendering/src/canvas.ts";
        const modelPath = "/packages/rendering/src/index.ts";
        const profilesPath = "/src/font-options.ts";
        const { drawCharDeskCanvasCells, loadCharDeskCanvasFonts, prepareCharDeskCanvasSurface } =
          await import(rendererPath);
        const { resolveCharDeskCellVisual } = await import(modelPath);
        const { galleryFontOptions } = await import(profilesPath);
        const fontProfile = galleryFontOptions["fusion-mono"].profile;
        await loadCharDeskCanvasFonts(["中"], { fontProfile });
        const metrics = { cellWidth: 9, cellHeight: 20, baseline: 15, fontSize: 15, fontFamily: "monospace" };
        const render = (underline: boolean) => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          prepareCharDeskCanvasSurface(canvas, context, 18, 40, devicePixelRatio);
          drawCharDeskCanvasCells(context, [{
            cell: resolveCharDeskCellVisual({ text: "中", color: "#000000", attrs: { underline } }),
            x: 0, y: 0, options: { metrics, fontProfile },
          }]);
          const raster = context.getImageData(0, 0, canvas.width, canvas.height);
          return Array.from({ length: 40 }, (_, row) => {
            let ink = 0;
            for (let y = Math.round(row * devicePixelRatio); y < Math.round((row + 1) * devicePixelRatio); y++) {
              for (let x = 0; x < raster.width; x++) ink += raster.data[(y * raster.width + x) * 4 + 3]!;
            }
            return ink;
          });
        };
        return { glyph: render(false), underlined: render(true) };
      });

      const glyphBottom = rows.glyph.findLastIndex((ink) => ink > 0);
      const underlineStart = rows.underlined.findIndex((ink, row) => ink > 0 && rows.glyph[row] === 0);
      expect(glyphBottom).toBeLessThan(19);
      expect(underlineStart).toBeGreaterThan(glyphBottom);
      expect(rows.underlined[19]).toBeGreaterThan(0);
      expect(rows.underlined.slice(20).every((ink) => ink === 0)).toBe(true);
    });
  });
}
