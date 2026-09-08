import { expect, test } from "@playwright/test";

test("Cell graphics raster coverage, seams and font independence", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/exp/web-tui/");
  const results = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const definitionsPath = "/packages/rendering/src/cell-graphics-definitions.ts";
    const { drawCharDeskCanvasCells, drawCharDeskCanvasDocument } = await import(rendererPath);
    const { resolveCharDeskCellVisual, createCharDeskRenderModel } = await import(modelPath);
    const { cellGraphicDefinitions } = await import(definitionsPath);
    const registered = Object.keys(cellGraphicDefinitions);
    const rows = [];
    for (const dpr of [1, 1.25, 2]) for (const zoom of [0.75, 1, 1.25, 2]) {
      const w = 9 * zoom, h = 20 * zoom;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * dpr * 4); canvas.height = Math.ceil(h * dpr * 4);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      const draw = (texts: string[], vertical = false, font = "Maple Mono") => {
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        drawCharDeskCanvasCells(ctx, texts.map((text, i) => ({
          cell: resolveCharDeskCellVisual({ text, color: "#000000" }),
          x: vertical ? 0 : i * w, y: vertical ? i * h : 0,
          options: { zoom, metrics: { cellWidth: 9, cellHeight: 20, fontSize: 15, baseline: 15, fontFamily: font },
            fontResolver: () => { throw new Error("Graphics must not resolve a font"); } },
        })));
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const alpha = (data: Uint8ClampedArray, x: number, y: number) => data[(y * canvas.width + x) * 4 + 3]!;
      const full = draw(["█", "█"], true);
      let holes = 0;
      for (let y = 0; y < Math.round(h * 2 * dpr); y++) for (let x = 0; x < Math.round(w * dpr); x++) {
        if (alpha(full, x, y) !== 255) holes++;
      }
      const lines: Record<string, number> = {};
      for (const [char, vertical] of [["─", false], ["│", true], ["═", false], ["║", true]] as const) {
        const pixels = draw([char, char, char], vertical);
        let gaps = 0;
        const length = Math.round((vertical ? h : w) * 3 * dpr);
        const breadth = Math.round((vertical ? w : h) * dpr);
        for (let a = 0; a < length; a++) {
          let ink = 0;
          for (let b = 0; b < breadth; b++) ink += alpha(pixels, vertical ? b : a, vertical ? a : b);
          if (!ink) gaps++;
        }
        lines[char] = gaps;
      }
      const emptyGlyphs: string[] = [];
      const fontDifferences: string[] = [];
      for (const char of registered) {
        const first = draw([char]);
        if (char !== "\u2800" && !first.some((v, i) => i % 4 === 3 && v)) emptyGlyphs.push(char);
        for (const font of ["Fusion Pixel 12px Mono latin", "Xiaolai Mono"]) {
          const next = draw([char], false, font);
          if (first.some((v, i) => next[i] !== v)) fontDifferences.push(char);
        }
      }
      const density = ["░", "▒", "▓"].map(char => draw([char]).reduce((sum, v, i) => sum + (i % 4 === 3 ? v : 0), 0));
      const cornerGaps: number[] = [];
      for (const text of ["╭─╮", "┌─┐", "╔═╗", "└─┘", "╰─╯", "╚═╝"]) {
        const pixels = draw([...text]);
        let gaps = 0;
        for (let x = Math.ceil(w * dpr / 2); x < Math.floor(w * dpr * 2.5); x++) {
          let ink = 0;
          for (let y = 0; y < Math.round(h * dpr); y++) ink += alpha(pixels, x, y);
          if (!ink) gaps++;
        }
        cornerGaps.push(gaps);
      }
      // Complementary fractions share the same snapped edge, including odd pixel dimensions.
      let fractionHoles = 0;
      for (const pair of [["▀", "▄"], ["▌", "▐"], ["▚", "▞"]]) {
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        drawCharDeskCanvasCells(ctx, pair.map(text => ({ cell: resolveCharDeskCellVisual({ text, color: "black" }), x: 0, y: 0, options: { zoom } })));
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 0; y < Math.round(h * dpr); y++) for (let x = 0; x < Math.round(w * dpr); x++) {
          if (alpha(pixels, x, y) !== 255) fractionHoles++;
        }
      }
      const direct = draw(["╭", "─", "╮"]);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      drawCharDeskCanvasDocument(ctx, createCharDeskRenderModel("╭─╮"), { zoom, padding: 0, palette: { color: "black", background: "white" } });
      const exported = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      rows.push({ dpr, zoom, registered: registered.length, holes, fractionHoles, lines, cornerGaps, emptyGlyphs, fontDifferences, density,
        exportMatches: direct.every((v, i) => exported[i] === v) });
    }
    return rows;
  });
  for (const row of results) {
    expect(row, JSON.stringify(row)).toMatchObject({ registered: 778, holes: 0, fractionHoles: 0, emptyGlyphs: [], fontDifferences: [], exportMatches: true });
    expect(Object.values(row.lines)).toEqual([0, 0, 0, 0]);
    expect(row.cornerGaps).toEqual([0, 0, 0, 0, 0, 0]);
    expect(row.density[0]).toBeLessThan(row.density[1]!);
    expect(row.density[1]).toBeLessThan(row.density[2]!);
  }
  await testInfo.attach("cell-graphics-raster.json", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
});
