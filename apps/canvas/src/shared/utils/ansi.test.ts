import { describe, expect, it } from "vitest";
import { effectiveCellStyle } from "./ansi";

describe("effectiveCellStyle", () => {
  it("uses the canvas background as inherited inverse foreground", () => {
    expect(
      effectiveCellStyle({
        char: "A",
        color: "#00ff00",
        attrs: { inverse: true },
      })
    ).toEqual({
      color: "#ffffff",
      bgColor: "#00ff00",
      attrs: { inverse: true },
    });
  });

  it("swaps explicit inverse foreground and background colors", () => {
    expect(
      effectiveCellStyle({
        char: "A",
        color: "#ff0000",
        bgColor: "#0000ff",
        attrs: { inverse: true },
      })
    ).toEqual({
      color: "#0000ff",
      bgColor: "#ff0000",
      attrs: { inverse: true },
    });
  });
});
