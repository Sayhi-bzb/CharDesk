import { describe, expect, it } from "vitest";
import { locateCharGraphSourceRange } from "./source-map.js";

describe("Markdown source mapping", () => {
  it("does not map a missing later token back to an earlier duplicate", () => {
    expect(locateCharGraphSourceRange(
      "same\nother",
      "same",
      { from: 0, to: 10 },
      5,
    )).toEqual({ from: 5, to: 9 });
  });
});
