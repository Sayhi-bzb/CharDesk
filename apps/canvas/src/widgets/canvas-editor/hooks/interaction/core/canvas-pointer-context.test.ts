import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { createCanvasPointerContextResolver } from "./pointerContext";

const rect = { left: 10, top: 20 } as DOMRect;
const createResolver = (currentRect: Pick<DOMRect, "left" | "top"> | null = rect) =>
  createCanvasPointerContextResolver({
    getRect: () => currentRect,
    getViewport: () => ({ offset: { x: 0, y: 0 }, zoom: 1 }),
    getContentSource: () => new GridSnapshotSource([["0,0", { char: "你", color: "#fff" }]]),
  });

describe("canvas pointer context resolver", () => {
  it("returns null without a canvas rect", () => {
    const resolver = createResolver(null);
    expect(resolver.resolveLocalPoint(10, 20)).toBeNull();
    expect(resolver.resolveGridPoint(10, 20)).toBeNull();
    expect(resolver.resolveHoverPoint(10, 20)).toBeNull();
  });

  it("resolves local and snapped grid points", () => {
    const resolver = createResolver();
    expect(resolver.resolveLocalPoint(18, 31)).toEqual({ x: 8, y: 11 });
    expect(resolver.resolveGridPoint(
      rect.left + DEFAULT_CANVAS_CELL_METRICS.cellWidth + 1,
      rect.top + 1
    )).toEqual({ x: 0, y: 0 });
  });

  it("rejects slide points outside the page and clamps drag endpoints", () => {
    const resolver = createCanvasPointerContextResolver({
      getRect: () => rect,
      getViewport: () => ({ offset: { x: 0, y: 0 }, zoom: 1 }),
      getContentSource: () => new GridSnapshotSource(),
      getGridBounds: () => ({ columns: 2, rows: 2 }),
    });

    const outsideX = rect.left + DEFAULT_CANVAS_CELL_METRICS.cellWidth * 4;
    const insideY = rect.top + DEFAULT_CANVAS_CELL_METRICS.cellHeight;
    expect(resolver.resolveGridPoint(outsideX, insideY)).toBeNull();
    expect(resolver.resolveClampedGridPoint(outsideX, insideY)).toEqual({ x: 1, y: 1 });
  });
});
