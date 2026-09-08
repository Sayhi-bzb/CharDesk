import { describe, expect, it, vi } from "vitest";
import {
  drawCanvasColorPickerAnchor,
  getStructuredSplitBoxActiveLeafBounds,
  type CanvasInteractionPalette,
} from "@/widgets/canvas-editor/hooks/useCanvasRenderer";
import { drawCanvasNavigationFocus } from "@/widgets/canvas-editor/rendering/canvasCellIndicator";
import {
  getStructuredLineHandlePoints,
  getStructuredRectHandlePoints,
} from "@/domains/structured-content/public";

const palette: CanvasInteractionPalette = {
  selectionSurface: "selection-surface",
  selectionBorder: "selection-border",
  textCursorSurface: "cursor-surface",
  textCursorForeground: "cursor-foreground",
  pickerOuter: "picker-outer",
  pickerInner: "picker-inner",
  pickerAccent: "picker-accent",
  eraserSurface: "eraser-surface",
  minimapSurface: "minimap-surface",
  minimapContent: "minimap-content",
  minimapViewportSurface: "minimap-viewport-surface",
  minimapViewportBorder: "minimap-viewport-border",
  workspaceSurface: "workspace-surface",
  pageShadow: "page-shadow",
};

describe("useCanvasRenderer structured rect handles", () => {
  it("draws the semantic active-cell fill and border", () => {
    const styles: { fill?: string; stroke?: string } = {};
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      set lineWidth(_value: number) {},
      set fillStyle(value: string | CanvasGradient | CanvasPattern) {
        styles.fill = String(value);
      },
      set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
        styles.stroke = String(value);
      },
    } as unknown as CanvasRenderingContext2D;

    drawCanvasNavigationFocus(ctx, { x: 2, y: 3 }, {
      offset: { x: 0, y: 0 },
      zoom: 1,
    }, palette);

    expect(styles).toEqual({
      fill: "selection-surface",
      stroke: "selection-border",
    });
    expect(ctx.fillRect).toHaveBeenCalledWith(18, 60, 9, 20);
    expect(ctx.strokeRect).toHaveBeenCalledWith(18, 60, 9, 20);
  });

  it("returns eight handles for rectangular structured nodes", () => {
    expect(
      getStructuredRectHandlePoints({ x: 2, y: 3, width: 5, height: 4 })
    ).toEqual([
      { handle: "nw", xRatio: 0, yRatio: 0 },
      { handle: "n", xRatio: 0.5, yRatio: 0 },
      { handle: "ne", xRatio: 1, yRatio: 0 },
      { handle: "e", xRatio: 1, yRatio: 0.5 },
      { handle: "se", xRatio: 1, yRatio: 1 },
      { handle: "s", xRatio: 0.5, yRatio: 1 },
      { handle: "sw", xRatio: 0, yRatio: 1 },
      { handle: "w", xRatio: 0, yRatio: 0.5 },
    ]);
  });

  it("keeps full handles for single-row backgrounds", () => {
    expect(
      getStructuredRectHandlePoints({ x: 0, y: 0, width: 5, height: 1 })
    ).toHaveLength(8);
  });

  it("keeps full handles for single-column backgrounds", () => {
    expect(
      getStructuredRectHandlePoints({ x: 0, y: 0, width: 1, height: 5 })
    ).toHaveLength(8);
  });

  it("returns endpoint handles for structured lines", () => {
    expect(getStructuredLineHandlePoints()).toEqual([
      { handle: "start", point: "start" },
      { handle: "end", point: "end" },
    ]);
  });

  it("resolves the active split box leaf under a grid point", () => {
    const splitBox = {
      id: "split-1",
      type: "splitBox" as const,
      order: 1,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 8 },
      verticalSplitRatio: 0.36,
      topSplitRatio: 0.25,
      bottomSplitRatio: 0.75,
      style: { color: "#000000" },
    };

    expect(getStructuredSplitBoxActiveLeafBounds(splitBox, { x: 2, y: 4 })).toEqual({
      x: 0,
      y: 2,
      width: 5,
      height: 5,
    });
    expect(getStructuredSplitBoxActiveLeafBounds(splitBox, { x: 20, y: 20 })).toBeNull();
    expect(getStructuredSplitBoxActiveLeafBounds(splitBox, null)).toBeNull();
  });

  it("draws a high-contrast canvas color picker cell anchor", () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      set lineWidth(_value: number) {},
      set strokeStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D;

    drawCanvasColorPickerAnchor(ctx, { x: 2, y: 3 }, {
      offset: { x: 0, y: 0 },
      zoom: 1,
    }, palette);

    expect(ctx.strokeRect).toHaveBeenCalledTimes(2);
    expect(ctx.strokeRect).toHaveBeenCalledWith(18, 60, 9, 20);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(4);
    expect(ctx.lineTo).toHaveBeenCalledTimes(8);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
