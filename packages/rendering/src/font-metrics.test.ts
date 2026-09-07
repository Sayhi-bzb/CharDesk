import { describe, expect, it, vi } from "vitest";
import { CHARDESK_SYSTEM_FONT_PROFILE } from "@chardesk/fonts";
import { getCharDeskCanvasCellAnchor, measureCharDeskCanvasFont } from "./canvas.js";

const context = (fontBounds = true) => ({
  save: vi.fn(), restore: vi.fn(), font: "", textBaseline: "alphabetic" as CanvasTextBaseline,
  measureText: vi.fn((text: string) => ({
    width: text === "0" ? 8.375 : 22,
    fontBoundingBoxAscent: fontBounds ? 12.5 : undefined,
    fontBoundingBoxDescent: fontBounds ? 3.25 : undefined,
    actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 3,
  } as TextMetrics)),
});

describe("font-driven Cell metrics", () => {
  it("uses fixed advance and font bounds, preserving fractional CSS pixels", () => {
    const ctx = context();
    const result = measureCharDeskCanvasFont(ctx);
    expect(result).toMatchObject({ source: "font-bounds", metrics: {
      cellWidth: 8.375, cellHeight: 15.75, baseline: 12.5, fontSize: 15,
    } });
    expect(ctx.measureText.mock.calls).toEqual([["0"], ["Mg"]]);
    expect(getCharDeskCanvasCellAnchor(0, 15.75, 1, 1, result.metrics).y).toBe(28.25);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it("labels actual glyph bounds when font bounds are unavailable", () => {
    expect(measureCharDeskCanvasFont(context(false))).toMatchObject({
      source: "glyph-bounds", metrics: { cellHeight: 14, baseline: 11 },
    });
  });
  it("applies em calibration using the effective face size", () => {
    const profile = { ...CHARDESK_SYSTEM_FONT_PROFILE, capabilities: {
      ...CHARDESK_SYSTEM_FONT_PROFILE.capabilities,
      display: { families: { regular: "Test" }, fontSizeScale: 2,
        cellMetrics: { width: 0.5, height: 1, baseline: 0.75 } },
    } };
    expect(measureCharDeskCanvasFont(context(), profile, 10)).toMatchObject({
      source: "calibrated", metrics: { cellWidth: 10, cellHeight: 20, baseline: 15 },
    });
  });
  it("rejects invalid measurements and leaves default anchors unchanged", () => {
    const ctx = context();
    ctx.measureText.mockReturnValue({ width: 0 } as TextMetrics);
    expect(() => measureCharDeskCanvasFont(ctx)).toThrow(RangeError);
    expect(ctx.restore).toHaveBeenCalledOnce();
    expect(getCharDeskCanvasCellAnchor(0, 0, 1).y).toBe(15);
  });
});
