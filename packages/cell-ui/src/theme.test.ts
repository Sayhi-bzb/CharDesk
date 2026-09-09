import { resolveCellStateStyle, resolveCellTextStyle } from "./visual.js";
import { resolveCellFeedback } from "./feedback.js";
import { expect, it } from "vitest";
import {
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
  DEFAULT_CELL_UI_THEME as theme,
} from "./theme.js";

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
  expect(theme).toBe(CLASSIC_MAC_LIGHT_THEME);
  expect(resolveCellFeedback().activationBlinkCount).toBe(2);
  expect(theme.cursorStyle).toEqual({
    shape: "block",
    color: "#000000",
    textColor: "#FFFFFF",
    blink: true,
    blinkIntervalMs: 600,
  });
  expect(theme.rangeStyle).toEqual({
    surface: "rgba(0, 0, 0, 0.22)",
    border: "#000000",
  });
});

it("exports a black-first Classic Macintosh light theme and its dark inverse", () => {
  expect(CLASSIC_MAC_LIGHT_THEME).toMatchObject({
    background: "#FFFFFF",
    foreground: "#000000",
    surfaceStyle: { backgroundColor: "#FFFFFF" },
    buttonPrimaryStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
    buttonPrimaryHoverStyle: { color: "#FFFFFF", backgroundColor: "#1A1A1A" },
    borderStyle: { color: "#000000" },
    focusedSurfaceStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
    hoveredItemStyle: { backgroundColor: "#E6E6E6" },
    selectedStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
    secondaryStyle: { color: "#555555" },
    disabledStyle: { color: "#777777" },
    textSelectionStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
    scrollThumbStyle: { color: "#000000" },
    scrollTrackStyle: { color: "#777777" },
  });
  expect(CLASSIC_MAC_DARK_THEME).toMatchObject({
    background: "#000000",
    foreground: "#FFFFFF",
    surfaceStyle: { backgroundColor: "#000000" },
    buttonPrimaryStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
    buttonPrimaryHoverStyle: { color: "#000000", backgroundColor: "#E6E6E6" },
    borderStyle: { color: "#FFFFFF" },
    focusedSurfaceStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
    hoveredItemStyle: { backgroundColor: "#1A1A1A" },
    selectedStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
    secondaryStyle: { color: "#AAAAAA" },
    disabledStyle: { color: "#888888" },
    textSelectionStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
    scrollThumbStyle: { color: "#FFFFFF" },
    scrollTrackStyle: { color: "#888888" },
  });
});

it("normalizes activation blink count at the feedback boundary", () => {
  expect(resolveCellFeedback({ activationBlinkCount: 0 }).activationBlinkCount).toBe(0);
  expect(resolveCellFeedback({ activationBlinkCount: 3 }).activationBlinkCount).toBe(3);
  expect(resolveCellFeedback({ activationBlinkCount: 9 as 2 }).activationBlinkCount).toBe(2);
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

it("keeps disabled, transient inverse, selection, focus, and hover in one priority chain", () => {
  expect(resolveCellStateStyle({}, { focused: true, collection: true }, theme)).toEqual({
    color: "#FFFFFF",
    backgroundColor: "#000000",
    bold: true,
  });
  expect(resolveCellStateStyle({}, { focused: true, selected: true, collection: true }, theme)).toEqual({
    color: "#FFFFFF",
    backgroundColor: "#000000",
    bold: true,
  });
  expect(resolveCellStateStyle({}, { focused: true, pressActive: true, collection: true }, theme)).toEqual({
    color: "#000000",
    backgroundColor: "#FFFFFF",
    bold: true,
  });
  expect(resolveCellStateStyle({}, { selected: true, activationFlash: true }, theme)).toEqual({
    color: "#000000",
    backgroundColor: "#FFFFFF",
  });
  expect(resolveCellStateStyle({}, {
    selected: true,
    disabled: true,
    pressActive: true,
  }, theme)).toEqual({
    color: "#777777",
    backgroundColor: "#000000",
  });
});
