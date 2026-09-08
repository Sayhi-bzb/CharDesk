import { expect, it } from "vitest";
import { DEFAULT_CELL_UI_THEME as theme, resolveCellStateStyle, resolveCellTextStyle } from "./theme.js";

it("resolves state priority without coupling collection focus to editor styling", () => {
  const custom = { ...theme, focusedSurfaceStyle: { backgroundColor: "gray" }, selectedStyle: { backgroundColor: "blue" }, disabledStyle: { color: "muted" } };
  expect(resolveCellStateStyle({}, { focused: true, collection: true }, custom))
    .toEqual({ backgroundColor: "gray", bold: true });
  expect(resolveCellStateStyle({}, { focused: true }, custom)).toEqual({ backgroundColor: "gray" });
  expect(resolveCellStateStyle({ color: "red" }, { focused: true, selected: true, collection: true, disabled: true }, custom))
    .toEqual({ backgroundColor: "blue", color: "muted", bold: true });
  expect(resolveCellStateStyle({}, { selected: true }, custom)).toEqual({ backgroundColor: "blue" });
});

it("defaults to a blinking terminal block cursor", () => {
  expect(theme.cursorStyle).toEqual({
    shape: "block",
    color: "#e8edf2",
    textColor: "#101419",
    blink: true,
    blinkIntervalMs: 600,
  });
  expect(theme.rangeStyle).toEqual({
    surface: "rgba(82, 155, 255, 0.32)",
    border: "#529bff",
  });
});

it("resolves selection and composition after base style without dropping unrelated attributes", () => {
  expect(resolveCellTextStyle({ bold: true, color: "red" }, { selected: true, composing: true }, theme))
    .toEqual({ ...theme.textSelectionStyle, bold: true, underline: true });
});

it("hover has no accent and cannot override focus, selection, or disabled", () => {
  expect(resolveCellStateStyle({}, { hovered: true, collection: true }, theme)).toEqual(theme.hoveredItemStyle);
  for (const state of [{ focused: true }, { selected: true }, { disabled: true }]) {
    expect(resolveCellStateStyle({}, { ...state, hovered: true, collection: true }, theme))
      .toEqual(resolveCellStateStyle({}, { ...state, collection: true }, theme));
  }
});
