import { describe, expect, it } from "vitest";

import { deriveTextFormattingModel } from "./text-format-model";

describe("deriveTextFormattingModel", () => {
  it("returns no formatting target without text styles", () => {
    expect(deriveTextFormattingModel([])).toBeNull();
  });

  it("distinguishes shared, absent, and mixed attributes", () => {
    expect(
      deriveTextFormattingModel([
        { attrs: { bold: true, italic: true, strike: true } },
        { attrs: { bold: true, underline: true, inverse: true } },
      ])
    ).toEqual({
      bold: "on",
      italic: "mixed",
      underline: "mixed",
      strike: "mixed",
      inverse: "mixed",
    });
  });
});
