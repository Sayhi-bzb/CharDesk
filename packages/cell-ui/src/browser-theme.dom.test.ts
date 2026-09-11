import { afterEach, describe, expect, it } from "vitest";
import {
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
} from "./theme.js";
import { readCellCssTheme } from "./browser-theme.js";

afterEach(() => document.body.replaceChildren());

const mountTheme = (tokens: Readonly<Record<string, string>>) => {
  const element = document.createElement("div");
  for (const [name, value] of Object.entries(tokens)) {
    element.style.setProperty(name, value);
  }
  document.body.append(element);
  return element;
};

describe("readCellCssTheme", () => {
  it("falls back to the Classic Macintosh light theme", () => {
    const { theme, palette } = readCellCssTheme(mountTheme({}));

    expect(palette).toEqual({ color: "#000000", background: "#FFFFFF" });
    expect(theme).toEqual(CLASSIC_MAC_LIGHT_THEME);
  });

  it("keeps button, disabled, and scrollbar tokens independent", () => {
    const { theme } = readCellCssTheme(mountTheme({
      "--cell-button-primary": "rgb(1, 2, 3)",
      "--cell-button-primary-foreground": "rgb(4, 5, 6)",
      "--cell-button-primary-hover": "rgb(7, 8, 9)",
      "--cell-muted-foreground": "rgb(10, 20, 30)",
      "--cell-disabled-foreground": "rgb(40, 50, 60)",
      "--cell-scrollbar-thumb": "rgb(70, 80, 90)",
      "--cell-scrollbar-track": "rgb(100, 110, 120)",
    }));

    expect(theme.buttonPrimaryStyle).toEqual({
      color: "rgb(4, 5, 6)",
      backgroundColor: "rgb(1, 2, 3)",
    });
    expect(theme.buttonPrimaryHoverStyle).toEqual({
      color: "rgb(4, 5, 6)",
      backgroundColor: "rgb(7, 8, 9)",
    });
    expect(theme.secondaryStyle.color).toBe("rgb(10, 20, 30)");
    expect(theme.disabledStyle.color).toBe("rgb(40, 50, 60)");
    expect(theme.scrollThumbStyle.color).toBe("rgb(70, 80, 90)");
    expect(theme.scrollTrackStyle.color).toBe("rgb(100, 110, 120)");
  });

  it("can consume the complete dark inverse through CSS tokens", () => {
    const { theme } = readCellCssTheme(mountTheme({
      "--cell-background": CLASSIC_MAC_DARK_THEME.background,
      "--cell-foreground": CLASSIC_MAC_DARK_THEME.foreground,
      "--cell-surface": CLASSIC_MAC_DARK_THEME.surfaceStyle.backgroundColor!,
      "--cell-surface-raised": CLASSIC_MAC_DARK_THEME.raisedSurfaceStyle.backgroundColor!,
      "--cell-button-primary": CLASSIC_MAC_DARK_THEME.buttonPrimaryStyle.backgroundColor!,
      "--cell-button-primary-foreground": CLASSIC_MAC_DARK_THEME.buttonPrimaryStyle.color!,
      "--cell-button-primary-hover": CLASSIC_MAC_DARK_THEME.buttonPrimaryHoverStyle.backgroundColor!,
      "--cell-highlight": CLASSIC_MAC_DARK_THEME.focusedSurfaceStyle.backgroundColor!,
      "--cell-hover": CLASSIC_MAC_DARK_THEME.hoveredItemStyle.backgroundColor!,
      "--cell-highlight-foreground": CLASSIC_MAC_DARK_THEME.focusedSurfaceStyle.color!,
      "--cell-muted-foreground": CLASSIC_MAC_DARK_THEME.secondaryStyle.color!,
      "--cell-disabled-foreground": CLASSIC_MAC_DARK_THEME.disabledStyle.color!,
      "--cell-border": CLASSIC_MAC_DARK_THEME.borderStyle.color!,
      "--cell-selection": CLASSIC_MAC_DARK_THEME.textSelectionStyle.backgroundColor!,
      "--cell-selection-foreground": CLASSIC_MAC_DARK_THEME.textSelectionStyle.color!,
      "--cell-range-surface": CLASSIC_MAC_DARK_THEME.rangeStyle.surface,
      "--cell-range-border": CLASSIC_MAC_DARK_THEME.rangeStyle.border,
      "--cell-range-surface-effect": CLASSIC_MAC_DARK_THEME.rangeStyle.surfaceEffect!,
      "--cell-cursor": CLASSIC_MAC_DARK_THEME.cursorStyle.color,
      "--cell-cursor-foreground": CLASSIC_MAC_DARK_THEME.cursorStyle.textColor,
      "--cell-scrollbar-thumb": CLASSIC_MAC_DARK_THEME.scrollThumbStyle.color!,
      "--cell-scrollbar-track": CLASSIC_MAC_DARK_THEME.scrollTrackStyle.color!,
    }));

    expect(theme).toMatchObject({
      ...CLASSIC_MAC_DARK_THEME,
      background: "rgb(0, 0, 0)",
      foreground: "rgb(255, 255, 255)",
      surfaceStyle: { backgroundColor: "rgb(0, 0, 0)" },
      raisedSurfaceStyle: { backgroundColor: "rgb(26, 26, 26)" },
      buttonPrimaryStyle: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)",
      },
      buttonPrimaryHoverStyle: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(230, 230, 230)",
      },
      borderStyle: { color: "rgb(255, 255, 255)" },
      focusedSurfaceStyle: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)",
      },
      hoveredItemStyle: { backgroundColor: "rgb(26, 26, 26)" },
      selectedStyle: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)",
      },
      secondaryStyle: { color: "rgb(170, 170, 170)" },
      disabledStyle: { color: "rgb(136, 136, 136)" },
      textSelectionStyle: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)",
      },
      cursorStyle: {
        ...CLASSIC_MAC_DARK_THEME.cursorStyle,
        color: "rgb(255, 255, 255)",
        textColor: "rgb(0, 0, 0)",
      },
      rangeStyle: {
        surface: "rgba(255, 255, 255, 0.18)",
        border: "rgb(255, 255, 255)",
        surfaceEffect: "contrast",
      },
      scrollThumbStyle: { color: "rgb(255, 255, 255)" },
      scrollTrackStyle: { color: "rgb(136, 136, 136)" },
    });
  });
});
