import { describe, expect, it } from "vitest";
import { resolveCanvasClickDecision } from "@/widgets/canvas-editor/hooks/interaction/gestures/clickInteraction";
import type { CanvasLinkHit } from "@/widgets/canvas-editor/hooks/interaction/core/linkHitTesting";

const linkHit: CanvasLinkHit = {
  y: 2,
  startX: 1,
  endX: 4,
  href: "https://example.com",
};

describe("canvas click interaction decisions", () => {
  it("consumes pending color-picker clicks before other click routes", () => {
    expect(
      resolveCanvasClickDecision({
        colorPickerClickPending: true,
        interactionMode: "idle",
        linkHit,
        shouldOpenLink: true,
      })
    ).toEqual({ type: "consume-color-picker-click" });
  });

  it("ignores clicks while an interaction is active", () => {
    expect(
      resolveCanvasClickDecision({
        colorPickerClickPending: false,
        interactionMode: "drawing",
        linkHit,
        shouldOpenLink: true,
      })
    ).toEqual({ type: "none" });
  });

  it("routes eligible link clicks", () => {
    expect(
      resolveCanvasClickDecision({
        colorPickerClickPending: false,
        interactionMode: "idle",
        linkHit,
        shouldOpenLink: true,
      })
    ).toEqual({ type: "open-link", hit: linkHit });
  });

  it("ignores link hits without the open modifier", () => {
    expect(
      resolveCanvasClickDecision({
        colorPickerClickPending: false,
        interactionMode: "idle",
        linkHit,
        shouldOpenLink: false,
      })
    ).toEqual({ type: "none" });
  });
});
