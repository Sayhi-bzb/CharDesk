import { describe, expect, it } from "vitest";
import {
  isDefaultArtifactForeground,
  projectArtifactCellStyle,
} from "./artifact-style";

describe("artifact foreground semantics", () => {
  const darkPalette = { color: "#f5f5f5", background: "#111111" };

  it("projects only the canonical unbacked foreground through the palette", () => {
    expect(isDefaultArtifactForeground({ color: "#000000" })).toBe(true);
    expect(projectArtifactCellStyle({ color: "#000000" }, darkPalette)).toEqual({
      color: "#f5f5f5",
    });
  });

  it("keeps foregrounds explicit when a background was authored", () => {
    for (const bgColor of ["#ffcc00", "transparent"]) {
      const style = { color: "#000000", bgColor };
      expect(isDefaultArtifactForeground(style)).toBe(false);
      expect(projectArtifactCellStyle(style, darkPalette)).toEqual(style);
    }
  });

  it("does not infer default semantics from similar or legacy colors", () => {
    for (const color of ["#000", "#0f172a", "rgb(0, 0, 0)"]) {
      expect(isDefaultArtifactForeground({ color })).toBe(false);
      expect(projectArtifactCellStyle({ color }, darkPalette)).toEqual({ color });
    }
  });
});
