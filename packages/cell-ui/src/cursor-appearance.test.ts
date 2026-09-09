import { expect, it } from "vitest";
import { resolveCellCursorStyle } from "./cursor-appearance.js";
import { CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME } from "./theme.js";

for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
  for (const shape of ["block", "bar", "underline"] as const) {
    it(`${shape} consumes final Cell colors and palette defaults (${theme.background})`, () => {
      const palette = { color: theme.foreground, background: theme.background };
      const cursor = { ...theme.cursorStyle, shape };
      for (const cell of [undefined, {}, { color: "#123456" }, { backgroundColor: "#abcdef" },
        theme.focusedSurfaceStyle, theme.textSelectionStyle, { color: "#987654", backgroundColor: "#fedcba" }]) {
        expect(resolveCellCursorStyle(cell, palette, cursor)).toEqual({
          ...cursor,
          color: cell?.color ?? palette.color,
          textColor: cell?.backgroundColor ?? palette.background,
        });
        const fixed = { ...cursor, colorMode: "fixed" as const };
        expect(resolveCellCursorStyle(cell, palette, fixed)).toBe(fixed);
      }
    });
  }
}

it("omitted colorMode defaults to inverse without changing configuration", () => {
  const cursor = { shape: "block" as const, color: "red", textColor: "blue", blink: false, blinkIntervalMs: 800 };
  expect(resolveCellCursorStyle(undefined, { color: "white", background: "black" }, cursor))
    .toEqual({ ...cursor, color: "white", textColor: "black" });
  expect(cursor.color).toBe("red");
});
