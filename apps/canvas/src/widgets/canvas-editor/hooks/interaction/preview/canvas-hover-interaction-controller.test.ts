import { describe, expect, it, vi } from "vitest";
import { createHoverInteractionController } from "@/widgets/canvas-editor/hooks/interaction/preview/hoverInteractionController";
import type { CanvasLinkHit } from "@/widgets/canvas-editor/hooks/interaction/core/linkHitTesting";

const linkHit: CanvasLinkHit = {
  href: "https://example.com",
  startX: 1,
  endX: 4,
  y: 2,
};

describe("hover interaction controller", () => {
  it("tracks link hover and uses a pointer cursor without modifiers", () => {
    const setCursor = vi.fn();
    const setHoveredLink = vi.fn();
    const controller = createHoverInteractionController({
      setCursor,
      setHoveredLink,
      setHoveredGrid: vi.fn(),
    });

    controller.updateLinkHover(linkHit);
    expect(controller.getLinkCandidate()).toBe(linkHit);
    expect(setHoveredLink).toHaveBeenCalledWith(linkHit);
    expect(setCursor).toHaveBeenCalledWith("pointer");
  });

  it("clears link hover and cursor", () => {
    const setCursor = vi.fn();
    const setHoveredLink = vi.fn();
    const controller = createHoverInteractionController({
      setCursor,
      setHoveredLink,
      setHoveredGrid: vi.fn(),
    });

    controller.updateLinkHover(linkHit);
    controller.clearLinkHover();

    expect(controller.getLinkCandidate()).toBeNull();
    expect(setHoveredLink).toHaveBeenLastCalledWith(null);
    expect(setCursor).toHaveBeenLastCalledWith("");
  });

  it("updates color picker hover with crosshair cursor", () => {
    const setCursor = vi.fn();
    const setHoveredGrid = vi.fn();
    const controller = createHoverInteractionController({
      setCursor,
      setHoveredLink: vi.fn(),
      setHoveredGrid,
    });

    controller.updateColorPickerHover({ x: 3, y: 5 });

    expect(setHoveredGrid).toHaveBeenCalledWith({ x: 3, y: 5 });
    expect(setCursor).toHaveBeenCalledWith("crosshair");
  });
});
