import { describe, expect, it } from "vitest";
import { resolveDrawingUpdateDecision } from "@/widgets/canvas-editor/hooks/interaction/gestures/drawingInteraction";

describe("drawing interaction updates", () => {
  it("does nothing without a previous grid point", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "brush",
        brushChar: "A",
        lastGrid: null,
        currentGrid: { x: 1, y: 1 },
        lastPlacedGrid: null,
      })
    ).toEqual({ type: "none" });
  });

  it("does nothing when the grid point has not changed", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "eraser",
        brushChar: "A",
        lastGrid: { x: 1, y: 1 },
        currentGrid: { x: 1, y: 1 },
        lastPlacedGrid: null,
      })
    ).toEqual({ type: "none" });
  });

  it("creates scratch points for single-width brush drawing", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "brush",
        brushChar: "A",
        lastGrid: { x: 0, y: 0 },
        currentGrid: { x: 2, y: 0 },
        lastPlacedGrid: null,
      })
    ).toEqual({
      type: "scratch",
      points: [
        { x: 0, y: 0, char: "A" },
        { x: 1, y: 0, char: "A" },
        { x: 2, y: 0, char: "A" },
      ],
      nextLastGrid: { x: 2, y: 0 },
      nextLastPlacedGrid: null,
    });
  });

  it("filters wide brush points by character occupancy", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "brush",
        brushChar: "界",
        lastGrid: { x: 0, y: 0 },
        currentGrid: { x: 3, y: 0 },
        lastPlacedGrid: null,
      })
    ).toEqual({
      type: "scratch",
      points: [
        { x: 0, y: 0, char: "界" },
        { x: 2, y: 0, char: "界" },
      ],
      nextLastGrid: { x: 3, y: 0 },
      nextLastPlacedGrid: { x: 2, y: 0 },
    });
  });

  it("continues wide brush filtering from the previous placed point", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "brush",
        brushChar: "界",
        lastGrid: { x: 2, y: 0 },
        currentGrid: { x: 4, y: 0 },
        lastPlacedGrid: { x: 2, y: 0 },
      })
    ).toMatchObject({
      type: "scratch",
      points: [{ x: 4, y: 0, char: "界" }],
      nextLastPlacedGrid: { x: 4, y: 0 },
    });
  });

  it("creates erase points for eraser drawing", () => {
    expect(
      resolveDrawingUpdateDecision({
        tool: "eraser",
        brushChar: "A",
        lastGrid: { x: 0, y: 0 },
        currentGrid: { x: 2, y: 0 },
        lastPlacedGrid: { x: 0, y: 0 },
      })
    ).toEqual({
      type: "erase",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      nextLastGrid: { x: 2, y: 0 },
      nextLastPlacedGrid: { x: 0, y: 0 },
    });
  });
});
