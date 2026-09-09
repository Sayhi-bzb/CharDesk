import { describe, expect, it } from "vitest";
import { resolveCanvasMoveDecision } from "@/widgets/canvas-editor/hooks/interaction/gestures/moveInteraction";
import type { CanvasLinkHit } from "@/widgets/canvas-editor/hooks/interaction/core/linkHitTesting";

const linkHit: CanvasLinkHit = {
  y: 2,
  startX: 1,
  endX: 5,
  href: "https://example.com",
};

const baseInput = {
  hasColorPickerTarget: false,
  tool: "select" as const,
  point: { x: 3, y: 4 },
  linkHit,
  eraserHoverPoint: null,
  staticRangeMoveHit: false,
};

describe("canvas move interaction decisions", () => {
  it("routes color-picker hover before link hover", () => {
    expect(
      resolveCanvasMoveDecision({
        ...baseInput,
        hasColorPickerTarget: true,
      })
    ).toEqual({ type: "color-picker-hover", point: { x: 3, y: 4 } });
  });

  it("keeps plain freeform moves as link hover only", () => {
    expect(resolveCanvasMoveDecision(baseInput)).toEqual({
      type: "canvas-hover",
      linkHit,
      action: { type: "none" },
    });
  });
  it("routes Hand hover to grab and suppresses link hover", () => {
    expect(
      resolveCanvasMoveDecision({
        ...baseInput,
        tool: "pan",
      })
    ).toEqual({
      type: "canvas-hover",
      linkHit: null,
      action: { type: "pan-hover" },
    });
  });

  it("routes a selected static range to a grab cursor", () => {
    expect(
      resolveCanvasMoveDecision({
        ...baseInput,
        staticRangeMoveHit: true,
      })
    ).toEqual({
      type: "canvas-hover",
      linkHit: null,
      action: { type: "static-range-move-hover" },
    });
  });

});
