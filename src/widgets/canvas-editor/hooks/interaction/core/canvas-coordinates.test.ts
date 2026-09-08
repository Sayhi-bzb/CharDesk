import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  getLocalCanvasPoint,
  resolveClampedZoom,
  resolveHoverGridPoint,
  resolveSnappedGridPointFromScreen,
  resolveZoomAnchoredOffset,
} from "./coordinates";
import { DEFAULT_GRID_RENDER_METRICS } from "@/shared/metrics";

describe("canvas coordinate helpers", () => {
  const rect = { left: 10, top: 20 } as DOMRect;
  const viewport = { offset: { x: 0, y: 0 }, zoom: 1 };

  it("converts and snaps screen coordinates", () => {
    expect(getLocalCanvasPoint({ clientX: 18, clientY: 31, rect })).toEqual({ x: 8, y: 11 });
    expect(resolveSnappedGridPointFromScreen({
      clientX: rect.left + DEFAULT_GRID_RENDER_METRICS.cellWidth + 1,
      clientY: rect.top + 1,
      rect,
      viewport,
      source: new GridSnapshotSource([["0,0", { char: "你", color: "#ffffff" }]]),
    })).toEqual({ x: 0, y: 0 });
    expect(resolveHoverGridPoint({ clientX: 11, clientY: 21, rect, viewport })).toEqual({ x: 0, y: 0 });
  });

  it("clamps zoom and resolves anchored offset", () => {
    const nextZoom = resolveClampedZoom(1, 3, { min: 0.25, max: 2 });
    expect(nextZoom).toBe(2);
    expect(resolveZoomAnchoredOffset({
      anchor: { x: 100, y: 50 },
      previousOffset: { x: 20, y: 10 },
      currentZoom: 1,
      nextZoom,
    })).toEqual({ x: -60, y: -30 });
  });
});
