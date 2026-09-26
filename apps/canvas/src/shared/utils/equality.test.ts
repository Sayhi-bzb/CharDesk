import { describe, expect, it } from "vitest";
import { areJsonValuesEqual } from "./equality";

describe("areJsonValuesEqual", () => {
  it("ignores object key insertion order", () => {
    expect(
      areJsonValuesEqual(
        { id: "node-1", style: { color: "red", weight: 2 } },
        { style: { weight: 2, color: "red" }, id: "node-1" }
      )
    ).toBe(true);
  });

  it("compares nested arrays in order", () => {
    expect(areJsonValuesEqual({ points: [1, 2] }, { points: [1, 2] })).toBe(true);
    expect(areJsonValuesEqual({ points: [1, 2] }, { points: [2, 1] })).toBe(false);
  });

  it("uses JSON semantics for undefined object fields", () => {
    expect(areJsonValuesEqual({ id: "node-1", label: undefined }, { id: "node-1" })).toBe(
      true
    );
  });

  it("detects changed nested values", () => {
    expect(areJsonValuesEqual({ style: { color: "red" } }, { style: { color: "blue" } })).toBe(
      false
    );
  });
});
