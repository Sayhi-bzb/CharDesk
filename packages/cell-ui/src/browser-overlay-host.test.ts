import { describe, expect, it } from "vitest";
import { positionCellOverlay } from "./browser-overlay-host.js";

const anchor = { left: 82, top: 72, right: 92, bottom: 82 } as DOMRect;
const size = { width: 32, height: 24 };
const viewport = { width: 100, height: 100 };

describe("Cell overlay placement", () => {
  it("flips and clamps anchored content within the viewport", () => {
    expect(positionCellOverlay(anchor, size, viewport, "bottom-start"))
      .toEqual({ left: 68, top: 44 });
    expect(positionCellOverlay(anchor, size, viewport, "right-start"))
      .toEqual({ left: 46, top: 72 });
  });

  it("places modal content centrally or at the right edge", () => {
    expect(positionCellOverlay(null, size, viewport, "center"))
      .toEqual({ left: 34, top: 38 });
    expect(positionCellOverlay(null, size, viewport, "right"))
      .toEqual({ left: 68, top: 0 });
  });
});
