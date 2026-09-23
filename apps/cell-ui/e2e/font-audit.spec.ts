import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { selectGalleryFont } from "./helpers/gallery-font-select";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`font audit DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("prints native, Profile and Surface metrics with the production Mono font", async ({ page }, testInfo) => {
      await page.goto("/#/__fixtures/editor");
      await selectGalleryFont(page, "fusion-mono");
      await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", "fusion-mono");
      const surface = page.locator('[data-cell-probe="editor"]');
      await expect.poll(async () => (await readCellProbe(surface)).presentation?.fontAudit?.status).toBe("ready");
      const probe = await readCellProbe(surface);
      const report = probe.presentation!.fontAudit!.report!;
      const native = report.measurement.fontMetrics;
      expect(native.cellWidth).toBeGreaterThanOrEqual(7);
      expect(native.cellWidth).toBeLessThanOrEqual(8.5);
      expect(native.cellHeight).toBeGreaterThanOrEqual(15);
      expect(native.cellHeight).toBeLessThanOrEqual(16);
      expect(native.baseline).toBeGreaterThan(0);
      expect(native.baseline).toBeLessThan(native.cellHeight);
      expect(report.measurement.source).toBe("font-bounds");
      expect(report.measurement.metrics).toEqual(native);
      expect(report.metrics).toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
      expect(report.faceIdentity).toBe("requested-stack-only");
      for (const sample of report.samples.filter((s) => /^[A-Za-z0-9]$/.test(s.text))) {
        expect(sample.status).toBe("measured");
        expect(sample.advance).toBeGreaterThanOrEqual(7);
        expect(sample.advance).toBeLessThanOrEqual(8.5);
        expect(sample.effectiveBold).toBe(false);
      }
      expect(report.samples.some((s) => /^[\u2500-\u259F]$/u.test(s.text))).toBe(false);
      expect(probe.presentation?.cellGraphics?.source).toBe("cell-graphics");
      for (const text of ["世", "界", "→"]) {
        const sample = report.samples.find((entry) => entry.text === text && !entry.requestedBold)!;
        expect(sample.status).toBe("measured");
        expect(sample.advance).toBeGreaterThanOrEqual(14);
        expect(sample.advance).toBeLessThanOrEqual(17);
        if (text === "→") expect(sample.advanceOverflow).toBeCloseTo(sample.advance! - report.metrics.cellWidth, 3);
      }
      const printed = await page.evaluate(async (snapshot) => {
        const path = "/packages/cell-ui/src/probe.ts";
        const { formatCellProbe } = await import(path);
        return formatCellProbe(snapshot, { header: true });
      }, probe);
      expect(printed).toContain(`font-native=${native.cellWidth}×${native.cellHeight} baseline=${native.baseline}`);
      expect(printed).toContain(`font-grid=${native.cellWidth}×${native.cellHeight} baseline=${native.baseline} source=font-bounds`);
      expect(printed).toContain("surface-grid=9×20 baseline=15 source=explicit");
      expect(printed).toContain("font-identity=requested-stack-only");
      await testInfo.attach("font-audit.txt", { body: printed, contentType: "text/plain" });
    });
  });
}
