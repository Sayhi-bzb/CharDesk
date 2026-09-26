import { describe, expect, it } from "vitest";

import { isToolAllowedForMode } from "./tool";

describe("canvas tool availability", () => {
  it("allows Hand in every canvas mode", () => {
    expect(isToolAllowedForMode("pan", "freeform")).toBe(true);
    expect(isToolAllowedForMode("pan", "slide")).toBe(true);
  });

  it("keeps unsupported tools out of CellPlane modes", () => {
    expect(isToolAllowedForMode("text", "freeform")).toBe(false);
    expect(isToolAllowedForMode("arrowLine", "slide")).toBe(false);
  });
});
