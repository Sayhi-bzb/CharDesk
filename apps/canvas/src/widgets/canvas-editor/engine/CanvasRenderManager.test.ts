import { describe, expect, it } from "vitest";
import { CanvasRenderManager } from "./CanvasRenderManager";
import { CANVAS_FRAME_ALL, CANVAS_FRAME_INVALIDATION } from "./FrameScheduler";

describe("CanvasRenderManager", () => {
  it("invalidates only layers whose inputs changed", () => {
    const manager = new CanvasRenderManager();
    const grid = new Map();
    const initial = manager.update({
      background: [grid, 1],
      scratch: [null, 1],
      overlay: [null, 1],
    });
    expect(initial & CANVAS_FRAME_ALL).toBe(
      CANVAS_FRAME_INVALIDATION.background |
        CANVAS_FRAME_INVALIDATION.scratch |
        CANVAS_FRAME_INVALIDATION.overlay
    );
    manager.commit(initial);

    expect(
      manager.update({
        background: [grid, 1],
        scratch: [null, 1],
        overlay: [{ x: 1, y: 1 }, 1],
      })
    ).toBe(CANVAS_FRAME_INVALIDATION.overlay);
  });

  it("keeps canceled render inputs dirty until they are committed", () => {
    const manager = new CanvasRenderManager();
    const initialGrid = new Map([["0,0", "A"]]);
    const targetGrid = new Map([["0,0", "B"]]);
    const inputs = (grid: Map<string, string>, zoom: number) => ({
      background: [grid, zoom],
      scratch: [null, zoom],
      overlay: [grid, zoom],
    });
    const initial = manager.update(inputs(initialGrid, 1));
    manager.commit(initial);

    const target = inputs(targetGrid, 2);
    const scheduled = manager.update(target);
    const allRenderLayers =
      CANVAS_FRAME_INVALIDATION.background |
      CANVAS_FRAME_INVALIDATION.scratch |
      CANVAS_FRAME_INVALIDATION.overlay;

    expect(scheduled).toBe(allRenderLayers);
    expect(manager.update(target)).toBe(allRenderLayers);

    manager.commit(scheduled);
    expect(manager.update(target)).toBe(0);
  });

  it("commits only layers that were actually rendered", () => {
    const manager = new CanvasRenderManager();
    const inputs = {
      background: ["background"],
      scratch: ["scratch"],
      overlay: ["overlay"],
    };
    manager.update(inputs);
    manager.commit(CANVAS_FRAME_INVALIDATION.background);

    expect(manager.update(inputs)).toBe(
      CANVAS_FRAME_INVALIDATION.scratch |
        CANVAS_FRAME_INVALIDATION.overlay
    );
  });

  it("invalidates every render layer after reset", () => {
    const manager = new CanvasRenderManager();
    expect(manager.reset()).toBe(CANVAS_FRAME_ALL);
  });
});
