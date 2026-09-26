import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import { resolveCanvasLinkHit } from "@/widgets/canvas-editor/hooks/interaction/core/linkHitTesting";
import {
  shouldUseCanvasLinkPointer,
  shouldOpenCanvasLink,
} from "@/widgets/canvas-editor/hooks/useCanvasInteraction";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import type { GridCellSource } from "@/shared/types";

const rect = { left: 10, top: 20 } as DOMRect;

const baseInput = (grid: GridCellSource) => ({
  clientX: 10,
  clientY: 20,
  rect,
  offset: { x: 0, y: 0 },
  zoom: 1,
  source: grid,
  canvasMode: "freeform" as const,
});

describe("resolveCanvasLinkHit", () => {
  it("returns the full href run for linked cells", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "A", color: "#ffffff", href: "https://example.com" }],
      ["1,0", { char: "B", color: "#ffffff", href: "https://example.com" }],
      ["2,0", { char: "C", color: "#ffffff", href: "https://example.com" }],
    ]);

    expect(
      resolveCanvasLinkHit({
        ...baseInput(grid),
        clientX: rect.left + DEFAULT_CANVAS_CELL_METRICS.cellWidth + 1,
      })
    ).toEqual({
      y: 0,
      startX: 0,
      endX: 2,
      href: "https://example.com",
    });
  });

  it("returns null for non-link cells", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "A", color: "#ffffff" }],
    ]);

    expect(resolveCanvasLinkHit(baseInput(grid))).toBeNull();
  });

  it("keeps adjacent different href values in separate runs", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "A", color: "#ffffff", href: "https://a.example" }],
      ["1,0", { char: "B", color: "#ffffff", href: "https://b.example" }],
    ]);

    expect(resolveCanvasLinkHit(baseInput(grid))).toEqual({
      y: 0,
      startX: 0,
      endX: 0,
      href: "https://a.example",
    });
  });

  it("snaps wide character follower cells back to the linked anchor range", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "你", color: "#ffffff", href: "https://example.com" }],
      ["2,0", { char: "A", color: "#ffffff", href: "https://example.com" }],
    ]);

    expect(
      resolveCanvasLinkHit({
        ...baseInput(grid),
        clientX: rect.left + DEFAULT_CANVAS_CELL_METRICS.cellWidth + 1,
      })
    ).toEqual({
      y: 0,
      startX: 0,
      endX: 2,
      href: "https://example.com",
    });
  });

});
describe("canvas link affordance", () => {
  const hit = { y: 0, startX: 0, endX: 2, href: "https://example.com" };

  it("requires Ctrl or Meta before opening a canvas link", () => {
    expect(shouldOpenCanvasLink({ ctrlKey: false, metaKey: false })).toBe(false);
    expect(shouldOpenCanvasLink({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(shouldOpenCanvasLink({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it("uses a hand cursor whenever the pointer is over a link", () => {
    expect(shouldUseCanvasLinkPointer(hit)).toBe(true);
    expect(shouldUseCanvasLinkPointer(null)).toBe(false);
  });
});
