import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPngBlobFromGrid,
  createSelectionPngBlob,
  resolveRasterLayout,
} from "./formats/raster";
import { withCharDeskCoreCellGlyphs } from "@chardesk/fonts";
import { displayFontOptions } from "@/shared/fonts/catalog";

describe("PNG raster export", () => {
  const originalFonts = document.fonts;
  let fillStyle = "";
  let strokeStyle = "";
  let font = "";
  let drawnFonts: Array<{ char: string; font: string }>;
  let drawnText: Array<{ char: string; color: string }>;

  beforeEach(() => {
    drawnText = [];
    drawnFonts = [];
    fillStyle = "";
    strokeStyle = "";
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]), ready: Promise.resolve([]) },
    });

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn((char: string) => {
        drawnText.push({ char, color: fillStyle });
        drawnFonts.push({ char, font });
      }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      set fillStyle(value: string) {
        fillStyle = value;
      },
      set strokeStyle(value: string) {
        strokeStyle = value;
      },
      set font(value: string) { font = value; },
      set textBaseline(_value: CanvasTextBaseline) {},
      set textAlign(_value: CanvasTextAlign) {},
      set lineWidth(_value: number) {},
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: originalFonts,
    });
  });

  it("uses DPR 2 when safe and falls back to DPR 1 before allocation", () => {
    expect(resolveRasterLayout(10, 10).dpr).toBe(2);
    expect(resolveRasterLayout(400, 200).dpr).toBe(1);
  });

  it.each(["maple", "ark-mono", "xiaolai-mono"] as const)("exports %s text with Core borders in whole and selection PNGs", async (id) => {
    const profile = withCharDeskCoreCellGlyphs(displayFontOptions[id].profile);
    const grid = new Map([
      ["0,0", { char: "A", color: "#000000" }],
      ["1,0", { char: "╭", color: "#000000", attrs: { bold: true as const } }],
      ["2,0", { char: "█", color: "#000000" }],
    ]);
    for (const whole of [true, false]) {
      drawnFonts = [];
      if (whole) await createPngBlobFromGrid(grid, false, true, profile);
      else await createSelectionPngBlob(grid, [{ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } }], false, true, profile);
      expect(drawnFonts.find(({ char }) => char === "A")?.font).toContain(profile.capabilities.display.families.regular);
      expect(drawnFonts.filter(({ char }) => char !== "A")).toEqual([
        { char: "╭", font: "15px 'JuliaMono'" }, { char: "█", font: "15px 'JuliaMono'" },
      ]);
      expect(document.fonts.load).toHaveBeenCalledWith("15px 'JuliaMono'", expect.any(String));
    }
  });

  it("rejects an unsafe edge before creating a canvas", async () => {
    const createElement = vi.spyOn(document, "createElement");

    await expect(
      createSelectionPngBlob(
        new Map(),
        [{ start: { x: 0, y: 0 }, end: { x: 910, y: 0 } }],
        false
      )
    ).rejects.toMatchObject({ code: "image-too-large" });
    expect(createElement).not.toHaveBeenCalled();
  });

  it("rejects an unsafe total pixel count even when each edge fits", () => {
    expect(() => resolveRasterLayout(800, 300)).toThrow(
      expect.objectContaining({ code: "image-too-large" })
    );
  });

  it("reports canvas allocation and PNG encoding failures separately", async () => {
    const selection = [{ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }];
    const grid = new Map([["0,0", { char: "A", color: "#000000" }]]);

    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    await expect(createSelectionPngBlob(grid, selection, false)).rejects.toMatchObject({
      code: "canvas-unavailable",
    });

    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
      callback(null);
    });
    await expect(createSelectionPngBlob(grid, selection, false)).rejects.toMatchObject({
      code: "encoding-failed",
    });
  });

  it("renders inverse glyphs with their effective foreground color", async () => {
    await createSelectionPngBlob(
      new Map([
        [
          "0,0",
          {
            char: "A",
            color: "#ff0000",
            bgColor: "#ffffff",
            attrs: { inverse: true, underline: true, strike: true },
          },
        ],
      ]),
      [{ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }],
      false
    );

    expect(drawnText).toContainEqual({ char: "A", color: "#ffffff" });
    expect(strokeStyle).toBe("#ffffff");
  });

  it("keeps the complete bounding box between multiple ranges", async () => {
    await createSelectionPngBlob(
      new Map([
        ["0,0", { char: "A", color: "#111111" }],
        ["1,0", { char: "B", color: "#222222" }],
        ["2,0", { char: "C", color: "#333333" }],
      ]),
      [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { start: { x: 2, y: 0 }, end: { x: 2, y: 0 } },
      ],
      false
    );

    expect(drawnText.map(({ char }) => char)).toEqual(["A", "B", "C"]);
  });
});
