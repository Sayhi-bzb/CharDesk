import { describe, expect, it } from "vitest";
import { resolveCanvasDragTermination } from "./gestureAdapter";

describe("canvas gesture adapter", () => {
  it("completes ordinary pointer release and capture-loss fallback", () => {
    expect(resolveCanvasDragTermination({
      canceled: false,
      eventType: "pointerup",
    })).toBe("complete");
    expect(resolveCanvasDragTermination({
      canceled: false,
      eventType: "lostpointercapture",
    })).toBe("complete");
  });

  it("cancels explicit interruption and pointer cancellation", () => {
    expect(resolveCanvasDragTermination({
      canceled: true,
      eventType: "pointerup",
    })).toBe("cancel");
    expect(resolveCanvasDragTermination({
      canceled: false,
      eventType: "pointercancel",
    })).toBe("cancel");
  });
});
