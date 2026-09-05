import { describe, expect, it } from "vitest";
import { GestureManager } from "./index.js";

describe("GestureManager", () => {
  it("lets ancestor scroll win vertical movement and cancels child tap", () => {
    const gestures = new GestureManager();
    gestures.begin(1, { x: 2, y: 2 }, [
      { targetId: "item", kind: "tap" },
      { targetId: "scroll", kind: "scroll", axis: "y" },
    ]);

    expect(gestures.move(1, { x: 2, y: 4 })).toEqual([
      expect.objectContaining({ targetId: "item", kind: "tap", phase: "cancel" }),
      expect.objectContaining({
        targetId: "scroll",
        kind: "scroll",
        phase: "start",
        delta: { x: 0, y: 2 },
      }),
    ]);
    expect(gestures.end(1, { x: 2, y: 5 })).toEqual([
      expect.objectContaining({
        targetId: "scroll",
        kind: "scroll",
        phase: "end",
        delta: { x: 0, y: 1 },
      }),
    ]);
  });

  it("lets an axis-matched child drag beat ancestor scroll", () => {
    const gestures = new GestureManager();
    gestures.begin(2, { x: 0, y: 0 }, [
      { targetId: "handle", kind: "tap" },
      { targetId: "handle", kind: "drag", axis: "x" },
      { targetId: "scroll", kind: "scroll", axis: "y" },
    ]);

    expect(gestures.move(2, { x: 3, y: 0 })).toEqual([
      expect.objectContaining({ kind: "tap", phase: "cancel" }),
      expect.objectContaining({ kind: "scroll", phase: "cancel" }),
      expect.objectContaining({
        targetId: "handle",
        kind: "drag",
        phase: "start",
      }),
    ]);
  });

  it("completes tap without movement and cancels the pending scroll", () => {
    const gestures = new GestureManager();
    gestures.begin(3, { x: 1, y: 1 }, [
      { targetId: "item", kind: "tap" },
      { targetId: "scroll", kind: "scroll" },
    ]);

    expect(gestures.end(3, { x: 1, y: 1 })).toEqual([
      expect.objectContaining({ targetId: "scroll", phase: "cancel" }),
      expect.objectContaining({ targetId: "item", kind: "tap", phase: "end" }),
    ]);
  });

  it("cancels every pending recognizer when the pointer is cancelled", () => {
    const gestures = new GestureManager();
    gestures.begin(4, { x: 1, y: 1 }, [
      { targetId: "item", kind: "tap" },
      { targetId: "scroll", kind: "scroll" },
    ]);

    expect(gestures.cancel(4)).toEqual([
      expect.objectContaining({ targetId: "item", phase: "cancel" }),
      expect.objectContaining({ targetId: "scroll", phase: "cancel" }),
    ]);
    expect(gestures.end(4, { x: 1, y: 1 })).toEqual([]);
  });

  it("cancels tap when movement crosses the threshold on an unsupported axis", () => {
    const gestures = new GestureManager();
    gestures.begin(5, { x: 0, y: 0 }, [
      { targetId: "item", kind: "tap" },
      { targetId: "scroll", kind: "scroll", axis: "y" },
    ]);

    expect(gestures.move(5, { x: 2, y: 0 })).toEqual([
      expect.objectContaining({ targetId: "item", phase: "cancel" }),
      expect.objectContaining({ targetId: "scroll", phase: "cancel" }),
    ]);
    expect(gestures.end(5, { x: 2, y: 0 })).toEqual([]);
  });
});
