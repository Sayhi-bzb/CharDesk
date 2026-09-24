import { describe, expect, it } from "vitest";
import { codeLineCount, shouldCollapseCode } from "./code-block-lines";

describe("Gallery code block preview", () => {
  it("numbers source lines, including blanks but not a terminal newline", () => {
    expect(codeLineCount("one\n\nthree")).toBe(3);
    expect(codeLineCount("one\n\nthree\n")).toBe(3);
    expect(codeLineCount("one")).toBe(1);
  });

  it("keeps 20 lines open and folds 21 lines", () => {
    expect(shouldCollapseCode(Array(20).fill("line").join("\n"))).toBe(false);
    expect(shouldCollapseCode(Array(21).fill("line").join("\n"))).toBe(true);
    expect(shouldCollapseCode(`${Array(20).fill("line").join("\n")}\n`)).toBe(false);
  });
});
