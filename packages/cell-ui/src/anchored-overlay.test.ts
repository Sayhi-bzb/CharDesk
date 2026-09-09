import { describe, expect, it } from "vitest";
import { placeAnchoredOverlay } from "./anchored-overlay.js";

const viewport = { x: 0, y: 0, width: 20, height: 10 };

describe("placeAnchoredOverlay", () => {
  it("prefers the full space below the anchor", () => {
    expect(placeAnchoredOverlay(
      { x: 2, y: 2, width: 8, height: 1 },
      { width: 10, height: 4 },
      viewport
    )).toEqual({
      bounds: { x: 2, y: 3, width: 10, height: 4 },
      side: "below",
      constrained: false,
    });
  });

  it("flips above when only the full upper space fits", () => {
    expect(placeAnchoredOverlay(
      { x: 2, y: 8, width: 8, height: 1 },
      { width: 10, height: 4 },
      viewport
    )).toMatchObject({
      bounds: { x: 2, y: 4, width: 10, height: 4 },
      side: "above",
      constrained: false,
    });
  });

  it("uses the larger side and constrains height without covering the anchor", () => {
    expect(placeAnchoredOverlay(
      { x: 2, y: 4, width: 8, height: 1 },
      { width: 10, height: 8 },
      viewport
    )).toEqual({
      bounds: { x: 2, y: 5, width: 10, height: 5 },
      side: "below",
      constrained: true,
    });
  });

  it("breaks equal-space ties below and clamps horizontally", () => {
    expect(placeAnchoredOverlay(
      { x: 18, y: 4, width: 2, height: 1 },
      { width: 8, height: 8 },
      viewport
    )).toMatchObject({
      bounds: { x: 12, y: 5, width: 8, height: 5 },
      side: "below",
    });
  });
});
