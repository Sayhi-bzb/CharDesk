import { expect, test } from "@playwright/test";
import { copyCellRange, readCellMetrics, readCellProbe } from "./helpers/cell-probe";
import { fusionMonoStylesheetRequest } from "./helpers/fusion-mono";
import { selectGalleryFont } from "./helpers/gallery-font-select";

test("keeps the first visible Surface geometry stable across a cold reload", async ({ page }) => {
  await page.addInitScript(() => {
    const samples: Array<{ height: string; width: string }> = [];
    Object.defineProperty(window, "__cellGeometrySamples", { configurable: true, value: samples });
    const started = performance.now();
    const sample = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-cell-probe="component-text"] canvas');
      if (canvas) samples.push({ height: canvas.style.height, width: canvas.style.width });
      if (performance.now() - started < 1_000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  for (let reload = 0; reload < 3; reload += 1) {
    if (reload === 0) await page.goto("/exp/web-tui/#/components/text");
    else await page.reload();
    const surface = page.locator('[data-cell-probe="component-text"]');
    await expect(surface).toBeVisible();
    await expect.poll(async () => (await readCellProbe(surface)).presentation?.measurement?.ready).toBe(true);
    await page.waitForTimeout(100);
    const samples = await page.evaluate(() =>
      (window as typeof window & { __cellGeometrySamples: Array<{ height: string; width: string }> })
        .__cellGeometrySamples);
    expect(samples.length).toBeGreaterThan(0);
    expect(new Set(samples.map(({ height }) => height))).toEqual(new Set(["240px"]));
    expect(new Set(samples.map(({ width }) => width))).toEqual(new Set(["324px"]));
  }
});

for (const candidate of ["substitute-mono", "fusion-mono", "xiaolai-mono"]) {
  const xiaolai = candidate === "xiaolai-mono";
  for (const dpr of [1, 1.25, 2]) {
    test.describe(`font grid ${candidate} DPR ${dpr}`, () => {
      test.use({ deviceScaleFactor: dpr });
      test("font switches preserve the grid, editing, hit testing and rectangle copy", async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        if (candidate === "substitute-mono") await page.route(fusionMonoStylesheetRequest, (route) => route.fulfill({
          contentType: "text/css",
          body: '@font-face { font-family: "Fusion Pixel 12px Mono latin"; src: local("Arial"), local("DejaVu Sans"); }',
        }));
        await page.goto("/exp/web-tui/#/__fixtures/all");
        const surface = page.locator('[data-cell-probe="editor"]');
        const canvas = surface.locator("canvas");
        const input = page.getByRole("textbox", { name: "File name", exact: true });
        const original = await readCellMetrics(surface);
        await input.fill("abcdef");
        const text = (await readCellProbe(surface)).text;
        await selectGalleryFont(page, "Fusion Pixel 12px Mono");
        await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", "fusion-mono");
        if (xiaolai) {
          await selectGalleryFont(page, "Xiaolai Mono");
          await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", candidate, { timeout: 60_000 });
          await expect.poll(async () => (await readCellProbe(surface)).presentation?.fontAudit?.status, { timeout: 60_000 }).toBe("ready");
          const snapshot = await readCellProbe(surface);
          const report = snapshot.presentation!.fontAudit!.report!;
          expect(report.metrics.fontSize).toBe(15);
          expect(report.metrics.cellWidth).toBeGreaterThan(0);
          expect(report.metrics).toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
          const samples = report.samples.filter((s) => "AiMW世界│█▀▄─┌└→".includes(s.text) && !s.requestedBold);
          expect(samples.every((s) => s.status === "measured")).toBe(true);
          expect(report.samples.every((s) => !s.effectiveBold)).toBe(true);
          expect(snapshot.presentation?.requestedFontRoutes.display?.boldStrategy).toBe("overdraw");
          expect(snapshot.presentation?.requestedFontRoutes.cjk?.boldStrategy).toBe("overdraw");
          expect(snapshot.presentation?.requestedFontRoutes.display?.boldOverdrawEm).toBe(1 / 15);
          expect(snapshot.presentation?.requestedFontRoutes.cjk?.boldOverdrawEm).toBe(1 / 15);
          const raster = await page.evaluate(async () => {
            const rendererPath = "/packages/rendering/src/canvas.ts";
            const modelPath = "/packages/rendering/src/index.ts";
            const profilesPath = "/exp/web-tui/font-options.ts";
            const { drawCharDeskCanvasCells, prepareCharDeskCanvasSurface } = await import(rendererPath);
            const { resolveCharDeskCellVisual } = await import(modelPath);
            const { galleryFontOptions } = await import(profilesPath);
            const metrics = { cellWidth: 9, cellHeight: 20, baseline: 15, fontSize: 15, fontFamily: "monospace" };
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d")!;
            prepareCharDeskCanvasSurface(canvas, context, 36, 20, devicePixelRatio);
            const draw = (bold: boolean) => {
              context.clearRect(0, 0, 36, 20);
              drawCharDeskCanvasCells(context, [
                { cell: resolveCharDeskCellVisual({ text: "A", color: "black", attrs: { bold } }), x: 0, y: 0,
                  options: { metrics, fontProfile: galleryFontOptions["xiaolai-mono"].profile } },
                { cell: resolveCharDeskCellVisual({ text: "界", color: "black", attrs: { bold } }), x: 9, y: 0,
                  options: { metrics, fontProfile: galleryFontOptions["xiaolai-mono"].profile } },
              ]);
              return canvas.toDataURL();
            };
            return { regular: draw(false), bold: draw(true) };
          });
          expect(raster.bold).not.toBe(raster.regular);
          console.log(`${testInfo.project.name} Xiaolai DPR ${dpr}`, JSON.stringify({
            metrics: report.metrics,
            samples: samples.map(({ text, advance, advanceOverflow, verticalGap }) => ({ text, advance, advanceOverflow, verticalGap })),
          }));
          const printed = await page.evaluate(async (probe) => {
            const path = "/packages/cell-ui/src/probe.ts";
            return (await import(path)).formatCellProbe(probe, { header: true });
          }, snapshot);
          await testInfo.attach("xiaolai-char-snapshot.txt", { body: printed, contentType: "text/plain" });
          await testInfo.attach("xiaolai-font-audit.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
          await testInfo.attach("xiaolai-bold-overdraw-raster", {
            body: Buffer.from(raster.bold.split(",")[1]!, "base64"), contentType: "image/png",
          });
        }
        const metrics = await readCellMetrics(surface);
        expect(metrics).toEqual(original);
        expect(metrics).toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
        expect((await readCellProbe(surface)).text).toBe(text);
        await canvas.scrollIntoViewIfNeeded();
        const bounds = (await canvas.boundingBox())!;
        const probe = await readCellProbe(surface);
        expect(bounds.width).toBeCloseTo(probe.viewport.width * metrics.cellWidth, 1);
        expect(bounds.height).toBeCloseTo(probe.viewport.height * metrics.cellHeight, 1);
        const point = (x: number, y: number) => ({ x: bounds.x + x * metrics.cellWidth, y: bounds.y + y * metrics.cellHeight });
        const start = point(3.5, 2.5);
        const end = point(6.5, 2.5);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();
        await expect(input).toHaveJSProperty("selectionStart", 2);
        await expect(input).toHaveJSProperty("selectionEnd", 5);
        const anchor = await input.evaluate((node) => ({ left: parseFloat(node.style.left), top: parseFloat(node.style.top), width: parseFloat(node.style.width), height: parseFloat(node.style.height) }));
        expect(anchor.left).toBeCloseTo(6 * metrics.cellWidth, 2);
        expect(anchor.top).toBeCloseTo(2 * metrics.cellHeight, 2);
        expect(anchor.width).toBeCloseTo(metrics.cellWidth, 2);
        expect(anchor.height).toBeCloseTo(metrics.cellHeight, 2);
        await page.keyboard.down("Alt"); await page.keyboard.down("Meta");
        const rangeStart = point(0.5, 1.5); const rangeEnd = point(39.5, 3.5);
        await page.mouse.move(rangeStart.x, rangeStart.y); await page.mouse.down();
        await page.mouse.move(rangeEnd.x, rangeEnd.y, { steps: 5 }); await page.mouse.up();
        await page.keyboard.up("Meta"); await page.keyboard.up("Alt");
        expect(await copyCellRange(surface)).toBe([
          `┌${"─".repeat(38)}┐`, `│abcdef${" ".repeat(32)}│`, `└${"─".repeat(38)}┘`,
        ].join("\n"));
        await testInfo.attach("font-grid-metrics", { body: JSON.stringify({ original, measured: metrics }), contentType: "application/json" });
      });
    });
  }
}
