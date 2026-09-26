import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasRenderActivity } from "./CanvasRenderActivity";

afterEach(() => vi.useRealTimers());

describe("CanvasRenderActivity", () => {
  it("settles viewport and content activity independently", () => {
    vi.useFakeTimers();
    const activity = new CanvasRenderActivity();
    const modes: string[] = [];
    activity.subscribe((mode) => modes.push(mode));

    activity.markContentActivity();
    expect(activity.getMode()).toBe("content-interaction");
    activity.markViewportActivity();
    expect(activity.getMode()).toBe("viewport-interaction");

    vi.advanceTimersByTime(80);
    expect(activity.getMode()).toBe("viewport-interaction");
    vi.advanceTimersByTime(40);
    expect(activity.getMode()).toBe("settled");
    expect(modes).toEqual([
      "content-interaction",
      "viewport-interaction",
      "settled",
    ]);
  });

  it("extends the settle deadline after repeated activity", () => {
    vi.useFakeTimers();
    const activity = new CanvasRenderActivity();
    activity.markViewportActivity();
    vi.advanceTimersByTime(100);
    activity.markViewportActivity();
    vi.advanceTimersByTime(100);
    expect(activity.getMode()).toBe("viewport-interaction");
    vi.advanceTimersByTime(20);
    expect(activity.getMode()).toBe("settled");
  });

  it("keeps one viewport settle timer during high-frequency activity", () => {
    vi.useFakeTimers();
    const activity = new CanvasRenderActivity();

    activity.markViewportActivity();
    for (let index = 0; index < 10; index += 1) {
      vi.advanceTimersByTime(8);
      activity.markViewportActivity();
      expect(vi.getTimerCount()).toBe(1);
    }

    vi.advanceTimersByTime(119);
    expect(activity.getMode()).toBe("viewport-interaction");
    vi.advanceTimersByTime(1);
    expect(activity.getMode()).toBe("settled");
  });
});
