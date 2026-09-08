import { describe, expect, it, vi } from "vitest";
import {
  createCanvasMoveExecutor,
  createCanvasMoveHandler,
  createCanvasMoveRouteHandler,
  executeCanvasMoveDecision,
  type CanvasMoveExecutor,
} from "@/widgets/canvas-editor/hooks/interaction/gestures/moveExecution";
import type { CanvasLinkHit } from "@/widgets/canvas-editor/hooks/interaction/core/linkHitTesting";

const linkHit: CanvasLinkHit = {
  y: 2,
  startX: 1,
  endX: 5,
  href: "https://example.com",
};

const createExecutor = (): CanvasMoveExecutor => ({
  updateColorPickerHover: vi.fn(),
  updateLinkHover: vi.fn(),
  setHoveredGrid: vi.fn(),
  setCursor: vi.fn(),
});

describe("canvas move execution", () => {
  it("executes color-picker hover without updating link hover", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      { type: "color-picker-hover", point: { x: 1, y: 2 } },
      executor
    );

    expect(executor.updateColorPickerHover).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(executor.updateLinkHover).not.toHaveBeenCalled();
  });

  it("clears link hover and applies the Hand idle cursor", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit: null,
        action: { type: "pan-hover" },
      },
      executor
    );

    expect(executor.updateLinkHover).toHaveBeenCalledWith(null);
    expect(executor.setCursor).toHaveBeenCalledWith("grab");
  });
  it("updates link hover before structured text cursor actions", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit,
        action: { type: "structured-text-cursor" },
      },
      executor
    );

    expect(executor.updateLinkHover).toHaveBeenCalledWith(linkHit);
    expect(executor.setCursor).toHaveBeenCalledWith("text");
  });

  it("shows grab for a movable static range", () => {
    const executor = createExecutor();
    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit: null,
        action: { type: "static-range-move-hover" },
      },
      executor
    );
    expect(executor.setCursor).toHaveBeenCalledWith("grab");
  });

  it("executes structured shape hover", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit: null,
        action: { type: "structured-shape-hover", point: { x: 3, y: 4 } },
      },
      executor
    );

    expect(executor.updateLinkHover).toHaveBeenCalledWith(null);
    expect(executor.setHoveredGrid).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(executor.setCursor).toHaveBeenCalledWith("crosshair");
  });

  it("executes structured select cursor hover", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit,
        action: { type: "structured-select-hover", cursor: "ew-resize" },
      },
      executor
    );

    expect(executor.setCursor).toHaveBeenCalledWith("ew-resize");
  });

  it("preserves the link pointer when structured select has no cursor", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit,
        action: { type: "structured-select-hover", cursor: "" },
      },
      executor
    );

    expect(executor.updateLinkHover).toHaveBeenCalledWith(linkHit);
    expect(executor.setCursor).not.toHaveBeenCalled();
  });

  it("executes eraser hover without changing cursor", () => {
    const executor = createExecutor();

    executeCanvasMoveDecision(
      {
        type: "canvas-hover",
        linkHit: null,
        action: { type: "eraser-hover", point: { x: 8, y: 1 } },
      },
      executor
    );

    expect(executor.setHoveredGrid).toHaveBeenCalledWith({ x: 8, y: 1 });
    expect(executor.setCursor).not.toHaveBeenCalled();
  });

  it("creates move executors that bind hover and cursor callbacks", () => {
    const updateColorPickerHover = vi.fn();
    const updateLinkHover = vi.fn();
    const setHoveredGrid = vi.fn();
    const setCursor = vi.fn();
    const executor = createCanvasMoveExecutor({
      updateColorPickerHover,
      updateLinkHover,
      setHoveredGrid,
      setCursor,
    });

    executor.updateColorPickerHover({ x: 1, y: 2 });
    executor.updateLinkHover(linkHit);
    executor.setHoveredGrid({ x: 3, y: 4 });
    executor.setCursor("crosshair");

    expect(updateColorPickerHover).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(updateLinkHover).toHaveBeenCalledWith(linkHit);
    expect(setHoveredGrid).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(setCursor).toHaveBeenCalledWith("crosshair");
  });

  it("creates move handlers that resolve color-picker priority", () => {
    const executor = createExecutor();
    const handler = createCanvasMoveHandler({ executor });

    handler({
      hasColorPickerTarget: true,
      canvasMode: "freeform",
      tool: "select",
      point: { x: 1, y: 2 },
      linkHit,
      structuredSelectCursor: null,
      eraserHoverPoint: null,
      staticRangeMoveHit: false,
    });

    expect(executor.updateColorPickerHover).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(executor.updateLinkHover).not.toHaveBeenCalled();
  });

  it("creates move handlers that resolve canvas hover actions", () => {
    const executor = createExecutor();
    const handler = createCanvasMoveHandler({ executor });

    handler({
      hasColorPickerTarget: false,
      canvasMode: "structured",
      tool: "select",
      point: { x: 1, y: 2 },
      linkHit,
      structuredSelectCursor: "move",
      eraserHoverPoint: null,
      staticRangeMoveHit: false,
    });

    expect(executor.updateLinkHover).toHaveBeenCalledWith(linkHit);
    expect(executor.setCursor).toHaveBeenCalledWith("move");
  });
  it("routes structured select moves with structured cursor resolution enabled", () => {
    const point = { x: 2, y: 3 };
    const handler = vi.fn();
    const resolveMoveContext = vi.fn(() => ({
      point,
      linkHit,
      structuredSelectCursor: "move",
      eraserHoverPoint: null,
    }));
    const route = createCanvasMoveRouteHandler({ handler });

    route({
      hasColorPickerTarget: false,
      canvasMode: "structured",
      tool: "select",
      clientPoint: { x: 20, y: 30 },
      resolveMoveContext,
      staticRangeMoveHit: false,
    });

    expect(resolveMoveContext).toHaveBeenCalledWith({
      clientPoint: { x: 20, y: 30 },
      shouldResolveStructuredSelectCursor: true,
      shouldResolveEraserHoverPoint: false,
    });
    expect(handler).toHaveBeenCalledWith({
      hasColorPickerTarget: false,
      canvasMode: "structured",
      tool: "select",
      point,
      linkHit,
      structuredSelectCursor: "move",
      eraserHoverPoint: null,
      staticRangeMoveHit: false,
    });
  });

  it("routes eraser moves with eraser hover resolution enabled", () => {
    const handler = vi.fn();
    const resolveMoveContext = vi.fn(() => ({
      point: { x: 2, y: 3 },
      linkHit: null,
      structuredSelectCursor: null,
      eraserHoverPoint: { x: 8, y: 9 },
    }));
    const route = createCanvasMoveRouteHandler({ handler });

    route({
      hasColorPickerTarget: true,
      canvasMode: "freeform",
      tool: "eraser",
      clientPoint: { x: 20, y: 30 },
      resolveMoveContext,
      staticRangeMoveHit: false,
    });

    expect(resolveMoveContext).toHaveBeenCalledWith({
      clientPoint: { x: 20, y: 30 },
      shouldResolveStructuredSelectCursor: false,
      shouldResolveEraserHoverPoint: true,
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hasColorPickerTarget: true,
        canvasMode: "freeform",
        tool: "eraser",
        eraserHoverPoint: { x: 8, y: 9 },
      })
    );
  });
});
