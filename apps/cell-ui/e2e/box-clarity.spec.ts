import { expect, test } from "@playwright/test";


test("Box straight strokes have opaque cores and separated double lines", async ({ page }, testInfo) => {
  await page.goto("/");
  const rows = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const { drawCharDeskCanvasCells } = await import(rendererPath);
    const { resolveCharDeskCellVisual } = await import(modelPath);
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 220;
    const ctx = canvas.getContext("2d")!;
    const results = [];
    for (const dpr of [1, 1.25, 2]) for (const zoom of [0.75, 1, 1.25, 2]) {
      for (const offset of [0, 0.2, 0.5]) for (const char of ["─", "│", "━", "┃", "═", "║"]) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 160, 220);
        ctx.setTransform(dpr, 0, 0, dpr, offset, offset);
        drawCharDeskCanvasCells(ctx, [{ cell: resolveCharDeskCellVisual({ text: char, color: "black" }),
          x: 4, y: 4, options: { zoom } }]);
        const pixels = ctx.getImageData(0, 0, 160, 220).data;
        const vertical = "│┃║".includes(char);
        const start = Math.round(4 * dpr + offset);
        const end = Math.round((4 + (vertical ? 9 : 20) * zoom) * dpr + offset);
        const middle = Math.floor((4 + (vertical ? 20 : 9) * zoom / 2) * dpr + offset);
        const cross = [];
        for (let i = start; i < end; i++) cross.push(pixels[((vertical ? middle : i) * 160 + (vertical ? i : middle)) * 4 + 3]!);
        let bands = 0;
        cross.forEach((alpha, i) => { if (alpha && !cross[i - 1]) bands++; });
        const stroke = Math.max(1, Math.round(("━┃".includes(char) ? 4.5 : 1.5) * zoom * dpr));
        results.push({ dpr, zoom, offset, char, cross, bands,
          expectedBands: "═║".includes(char) ? 2 : 1,
          expectedInk: stroke * ("═║".includes(char) ? 2 : 1) });
      }
    }
    return results;
  });
  for (const row of rows) {
    expect(row.cross.filter(a => a > 0 && a < 255), JSON.stringify(row)).toEqual([]);
    expect(row.cross.filter(a => a === 255), JSON.stringify(row)).toHaveLength(row.expectedInk);
    expect(row.bands, JSON.stringify(row)).toBe(row.expectedBands);
  }
  await testInfo.attach("box-clarity.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
});

test("rounded, double and mixed-weight boxes retain connected outlines at fractional offsets", async ({ page }) => {
  await page.goto("/");
  const failures = await page.evaluate(async () => {
    const rendererPath = "/packages/rendering/src/canvas.ts";
    const modelPath = "/packages/rendering/src/index.ts";
    const { drawCharDeskCanvasDocument } = await import(rendererPath);
    const { createCharDeskRenderModel } = await import(modelPath);
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    const errors = [];
    for (const dpr of [1, 1.25, 2]) for (const zoom of [0.75, 1, 1.25, 2]) for (const offset of [0.2, 0.5]) {
      for (const [text, expected] of [["╭─╮\n│ │\n╰─╯", 1], ["╔═╗\n║ ║\n╚═╝", 2], ["┍━┑\n│ │\n┕━┙", 1], ["╼╾╼", 1]] as const) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 160, 300);
        ctx.setTransform(dpr, 0, 0, dpr, offset, offset);
        drawCharDeskCanvasDocument(ctx, createCharDeskRenderModel(text), {
          padding: 4, zoom, palette: { color: "black", background: "white" },
        });
        const pixels = ctx.getImageData(0, 0, 160, 300).data;
        const ink = new Set<number>();
        for (let i = 0; i < pixels.length / 4; i++) if (pixels[i * 4 + 3]! > 0) ink.add(i);
        let components = 0;
        while (ink.size) {
          components++;
          const first = ink.values().next().value!;
          const queue = [first]; ink.delete(first);
          while (queue.length) {
            const i = queue.pop()!;
            for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
              const x = i % 160 + dx, y = Math.floor(i / 160) + dy;
              if (x < 0 || x >= 160 || y < 0 || y >= 300) continue;
              const neighbor = y * 160 + x;
              if (ink.delete(neighbor)) queue.push(neighbor);
            }
          }
        }
        if (components !== expected) errors.push({ dpr, zoom, offset, text, components, expected });
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
});
