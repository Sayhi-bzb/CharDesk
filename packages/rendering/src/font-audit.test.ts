import { describe, expect, it, vi } from "vitest";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import { auditCharDeskCanvasFont, measureCharDeskCanvasFont } from "./canvas.js";

const profile = createCharDeskFontProfile({ id: "test/compact", display: {
  families: { regular: "Prop" }, weightPolicy: "regular", cellMetrics: { height: 1, baseline: 5 / 6 },
} });
const context = () => ({ font: "", textBaseline: "alphabetic" as CanvasTextBaseline,
  save: vi.fn(), restore: vi.fn(), measureText: vi.fn((text: string) => ({
    width: text === "│" ? 15 : 7.5, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4,
    actualBoundingBoxAscent: text === "│" ? 13.75 : 12.5,
    actualBoundingBoxDescent: text === "│" ? 1.25 : 2.5,
  } as TextMetrics)),
});

describe("font grid audit", () => {
  it("preserves native dimensions under partial grid calibration", () => {
    const result = measureCharDeskCanvasFont(context(), profile, 15);
    expect(result).toMatchObject({ source: "calibrated", fontMetricsSource: "font-bounds",
      fontMetrics: { cellWidth: 7.5, cellHeight: 20, baseline: 16 },
      metrics: { cellWidth: 7.5, cellHeight: 15, baseline: 12.5 } });
  });
  it("reports effective weights, overhangs and gap separately from grid fit", () => {
    const ctx = context();
    const metrics = measureCharDeskCanvasFont(ctx, profile, 15).metrics;
    const report = auditCharDeskCanvasFont(ctx, profile, metrics, [{ grapheme: "│", bold: true }, "g"]);
    expect(report.samples[0]).toMatchObject({ effectiveBold: false, requestedBold: true,
      requestedFamily: "Prop", top: -1.25, bottom: 13.75, overflowTop: 1.25, overflowBottom: 0,
      verticalGap: 0, advanceOverflow: 7.5, status: "measured" });
    expect(report.samples[1]).toMatchObject({ top: 0, bottom: 15, overflowBottom: 0, verticalGap: null });
    expect(report.faceIdentity).toBe("requested-stack-only");
    expect(ctx.restore).toHaveBeenCalledTimes(3);
  });
  it("audits the supplied explicit grid without changing it", () => {
    const metrics = { cellWidth: 8, cellHeight: 20, baseline: 16, fontSize: 15, fontFamily: "Explicit" };
    const report = auditCharDeskCanvasFont(context(), profile, metrics, ["│"]);
    expect(report.metrics).toEqual(metrics);
    expect(report.measurement.metrics.cellHeight).toBe(15);
    expect(report.samples[0]!.verticalGap).toBe(5);
  });
  it("does not label missing glyph bounds as measured or seamless", () => {
    const ctx = context();
    ctx.measureText.mockImplementation(() => ({ width: 7.5, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 } as TextMetrics));
    const report = auditCharDeskCanvasFont(ctx, profile, measureCharDeskCanvasFont(ctx, profile).metrics, ["│"]);
    expect(report.samples[0]).toMatchObject({ status: "unavailable", top: null, verticalGap: null });
  });
});
