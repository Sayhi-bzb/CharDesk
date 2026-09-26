import { describe, expect, it, vi } from "vitest";
import { CanvasFrameScheduler } from "./FrameScheduler";
import {
  CanvasEdgeScrollManager,
  EDGE_SCROLL_DELAY_MS,
} from "./CanvasEdgeScrollManager";

const createHarness = () => {
  let callback: FrameRequestCallback | null = null;
  const scheduler = new CanvasFrameScheduler({
    requestAnimationFrame: vi.fn((next) => {
      callback = next;
      return 1;
    }),
    cancelAnimationFrame: vi.fn(() => {
      callback = null;
    }),
    now: () => 0,
  });
  const camera = { panBy: vi.fn() };
  const manager = new CanvasEdgeScrollManager(
    scheduler,
    camera as never
  );
  const run = (timestamp: number) => {
    const next = callback;
    callback = null;
    next?.(timestamp);
  };
  return { camera, manager, run };
};

describe("CanvasEdgeScrollManager", () => {
  it("waits for the delay and then pans toward the pointed edge", () => {
    const { camera, manager, run } = createHarness();
    const onCameraMove = vi.fn();
    manager.update({
      clientPoint: { x: 995, y: 350 },
      getBounds: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      isEnabled: () => true,
      onCameraMove,
    });

    run(0);
    run(EDGE_SCROLL_DELAY_MS);
    expect(camera.panBy).not.toHaveBeenCalled();
    run(EDGE_SCROLL_DELAY_MS + 150);

    expect(camera.panBy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number)
    );
    expect(camera.panBy.mock.calls[0][0]).toBeLessThan(0);
    expect(camera.panBy.mock.calls[0][1]).toBeCloseTo(0);
    expect(onCameraMove).toHaveBeenCalledOnce();
  });

  it("does not run in the viewport center or after eligibility is lost", () => {
    const { camera, manager, run } = createHarness();
    let enabled = true;
    const session = {
      clientPoint: { x: 500, y: 350 },
      getBounds: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      isEnabled: () => enabled,
      onCameraMove: vi.fn(),
    };
    manager.update(session);
    run(1000);
    expect(camera.panBy).not.toHaveBeenCalled();

    manager.update({ ...session, clientPoint: { x: 999, y: 350 } });
    enabled = false;
    run(2000);
    expect(camera.panBy).not.toHaveBeenCalled();
  });

  it("can restart after a lifecycle cleanup stops the active session", () => {
    const { camera, manager, run } = createHarness();
    const session = {
      clientPoint: { x: 995, y: 350 },
      getBounds: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      isEnabled: () => true,
      onCameraMove: vi.fn(),
    };
    manager.update(session);
    manager.stop();
    manager.update(session);

    run(0);
    run(EDGE_SCROLL_DELAY_MS + 150);

    expect(camera.panBy).toHaveBeenCalledOnce();
  });
});
