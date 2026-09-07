import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

for (const dpr of [1, 1.25, 2]) {
  test.describe(`font audit DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("prints native, Profile and Surface metrics with the production Mono font", async ({ page }, testInfo) => {
      await page.goto("/exp/web-tui/#/__fixtures/all");
      await page.getByRole("button", { name: "Use Ark Pixel 12px Mono" }).click();
      await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", "ark-mono");
      const surface = page.locator('[data-cell-probe="editor"]');
      await expect.poll(async () => (await readCellProbe(surface)).presentation?.fontAudit?.status).toBe("ready");
      const probe = await readCellProbe(surface);
      const report = probe.presentation!.fontAudit!.report!;
      expect(report.measurement.fontMetrics).toMatchObject({ cellWidth: 7.5, cellHeight: 15, baseline: 12 });
      expect(report.measurement.source).toBe("font-bounds");
      expect(report.measurement.metrics).toEqual(report.measurement.fontMetrics);
      expect(report.metrics).toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
      expect(report.faceIdentity).toBe("requested-stack-only");
      for (const sample of report.samples.filter((s) => /^[A-Za-z0-9]$/.test(s.text))) {
        expect(sample.status).toBe("measured");
        expect(sample.advance).toBe(7.5);
        expect(sample.effectiveBold).toBe(false);
      }
      for (const text of ["世", "界", "│", "█", "▀", "▄", "─", "┌", "└", "→"]) {
        const sample = report.samples.find((entry) => entry.text === text && !entry.requestedBold)!;
        expect(sample.status).toBe("measured");
        // Upstream uses full-width CJK and these symbols, even in the Latin variant.
        expect(sample.advance).toBe(15);
        if (!["世", "界"].includes(text)) expect(sample.advanceOverflow).toBe(6);
      }
      const printed = await page.evaluate(async (snapshot) => {
        const path = "/packages/cell-ui/src/probe.ts";
        const { formatCellProbe } = await import(path);
        return formatCellProbe(snapshot, { header: true });
      }, probe);
      expect(printed).toContain("font-native=7.5×15 baseline=12");
      expect(printed).toContain("font-grid=7.5×15 baseline=12 source=font-bounds");
      expect(printed).toContain("surface-grid=9×20 baseline=15 source=default");
      expect(printed).toContain("font-identity=requested-stack-only");
      await testInfo.attach("font-audit.txt", { body: printed, contentType: "text/plain" });
    });
  });
}
