import { describe, expect, it, vi } from "vitest";
import { CanvasEngineRuntime } from "./CanvasEngineRuntime";
import { CanvasFrameScheduler } from "./FrameScheduler";

const cameraPort = () => ({
  getViewport: () => ({ offset: { x: 0, y: 0 }, zoom: 1 }),
  setViewport: vi.fn(),
});

describe("CanvasEngineRuntime", () => {
  it("owns manager replacement and teardown", () => {
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    });
    const runtime = new CanvasEngineRuntime(cameraPort(), scheduler);
    const first = { dispose: vi.fn() };
    const second = { dispose: vi.fn() };

    runtime.registerManager("interaction", first);
    runtime.registerManager("interaction", second);
    runtime.dispose();

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it("survives a StrictMode release and synchronous reacquire", async () => {
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    });
    const runtime = new CanvasEngineRuntime(cameraPort(), scheduler);
    const manager = { dispose: vi.fn() };
    runtime.registerManager("interaction", manager);

    const releaseFirstMount = runtime.acquire();
    releaseFirstMount();
    const releaseSecondMount = runtime.acquire();
    await Promise.resolve();

    expect(manager.dispose).not.toHaveBeenCalled();

    releaseSecondMount();
    await Promise.resolve();
    expect(manager.dispose).toHaveBeenCalledOnce();
  });

  it("makes owner release idempotent", async () => {
    const runtime = new CanvasEngineRuntime(cameraPort());
    const manager = { dispose: vi.fn() };
    runtime.registerManager("interaction", manager);
    const release = runtime.acquire();

    release();
    release();
    await Promise.resolve();

    expect(manager.dispose).toHaveBeenCalledOnce();
  });
});
