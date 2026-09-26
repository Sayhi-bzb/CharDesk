import { describe, expect, it } from "vitest";
import { shouldDrawCanvasGrid } from "./canvasGridVisibility";

describe("canvas grid visibility", () => {
  it("hides only grid lines when cells become too small", () => {
    expect(shouldDrawCanvasGrid(0.5)).toBe(true);
    expect(shouldDrawCanvasGrid(0.25)).toBe(false);
  });
});
