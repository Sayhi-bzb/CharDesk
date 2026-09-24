import type { CellTextStyle } from "./types.js";
import type { CellBorderShape } from "./border.js";
import type { SeparatorVariant } from "./separator.js";
import type { ProgressVariant } from "./progress.js";
import type { SpinnerVariant } from "./spinner.js";
import type { BadgeTone } from "./badge.js";
import {
  DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  type CharDeskCellCursorPaintStyle,
  type CharDeskCellRangePaintStyle,
  type CharDeskCellCursorShape,
} from "@chardesk/rendering";
import { CHARDESK_DARK_CONTENT_THEME, CHARDESK_LIGHT_CONTENT_THEME } from "@chardesk/rendering/theme";

export type CellCursorShape = CharDeskCellCursorShape;
type SeparatorGlyphs = Readonly<Record<
  SeparatorVariant,
  Readonly<Record<"horizontal" | "vertical", string>>
>>;
type ProgressGlyphs = Readonly<Record<
  ProgressVariant,
  Readonly<Record<"filled" | "empty", string>>
>>;

export type CellCursorStyle = CharDeskCellCursorPaintStyle & Readonly<{
  colorMode?: "inverse" | "fixed";
  blink: boolean;
  blinkIntervalMs: number;
}>;

export type CellMarkdownColors = Readonly<{
  accent: string;
  link: string;
  quote: string;
  muted: string;
  codeForeground: string;
  codeBackground: string;
}>;

export type CellUiThemeInput = Omit<Partial<CellUiTheme>, "markdownColors"> & Readonly<{
  markdownColors?: Partial<CellMarkdownColors>;
}>;

export type CellUiTheme = Readonly<{
  background: string;
  foreground: string;
  markdownColors: CellMarkdownColors;
  surfaceStyle: CellTextStyle;
  elevatedSurfaceStyle: CellTextStyle;
  buttonSolidStyle: CellTextStyle;
  badgeStyles: Readonly<Record<BadgeTone, CellTextStyle>>;
  borderStyle: CellTextStyle;
  borderShape: CellBorderShape;
  cursorStyle: CellCursorStyle;
  rangeStyle: CharDeskCellRangePaintStyle;
  treeExpandedIndicator: string;
  treeCollapsedIndicator: string;
  checkboxUncheckedIndicator: string;
  checkboxCheckedIndicator: string;
  radioCheckedIndicator: string;
  toggleOffIndicator: string;
  toggleOnIndicator: string;
  collectionSelectedIndicator: string;
  progressGlyphs: ProgressGlyphs;
  spinnerGlyphs: Readonly<Record<SpinnerVariant, readonly string[]>>;
  separatorGlyphs: SeparatorGlyphs;
  checkboxIndeterminateIndicator: string;
  sliderFilledTrack: string;
  sliderEmptyTrack: string;
  sliderThumb: string;
  sliderEmphasizedThumb: string;
  selectExpandedIndicator: string;
  selectCollapsedIndicator: string;
  selectSelectedIndicator: string;
  focusedSurfaceStyle: CellTextStyle;
  hoveredItemStyle: CellTextStyle;
  focusedItemStyle: CellTextStyle;
  selectedStyle: CellTextStyle;
  secondaryStyle: CellTextStyle;
  disabledStyle: CellTextStyle;
  textSelectionStyle: CellTextStyle;
  scrollThumbStyle: CellTextStyle;
  scrollTrackStyle: CellTextStyle;
}>;

const CLASSIC_MAC_SHARED_THEME = Object.freeze({
  borderShape: "square",
  treeExpandedIndicator: "▾",
  treeCollapsedIndicator: "▸",
  checkboxUncheckedIndicator: " ",
  checkboxCheckedIndicator: "x",
  radioCheckedIndicator: "●",
  toggleOffIndicator: "○",
  toggleOnIndicator: "●",
  collectionSelectedIndicator: "✓",
  progressGlyphs: Object.freeze({
    solid: Object.freeze({ filled: "█", empty: "░" }),
    outline: Object.freeze({ filled: "/", empty: "-" }),
  }),
  spinnerGlyphs: Object.freeze({
    wheel: Object.freeze(["◐", "◓", "◑", "◒"]),
    dots: Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
  }),
  separatorGlyphs: Object.freeze({
    line: Object.freeze({ horizontal: "─", vertical: "│" }),
    slash: Object.freeze({ horizontal: "/", vertical: "/" }),
    double: Object.freeze({ horizontal: "═", vertical: "║" }),
    dots: Object.freeze({ horizontal: "·", vertical: "·" }),
  }),
  checkboxIndeterminateIndicator: "-",
  sliderFilledTrack: "━",
  sliderEmptyTrack: "─",
  sliderThumb: "┃",
  sliderEmphasizedThumb: "█",
  selectExpandedIndicator: "▴",
  selectCollapsedIndicator: "▾",
  selectSelectedIndicator: "✓",
  focusedItemStyle: { bold: true },
});

export const CLASSIC_MAC_LIGHT_THEME: CellUiTheme = Object.freeze({
  ...CLASSIC_MAC_SHARED_THEME,
  background: "#FFFFFF",
  foreground: "#000000",
  markdownColors: Object.freeze({
    accent: CHARDESK_LIGHT_CONTENT_THEME.accent,
    link: CHARDESK_LIGHT_CONTENT_THEME.info,
    quote: CHARDESK_LIGHT_CONTENT_THEME.success,
    muted: CHARDESK_LIGHT_CONTENT_THEME["muted-foreground"],
    codeForeground: CHARDESK_LIGHT_CONTENT_THEME.info,
    codeBackground: CHARDESK_LIGHT_CONTENT_THEME.surface,
  }),
  surfaceStyle: { backgroundColor: "#FFFFFF" },
  elevatedSurfaceStyle: { backgroundColor: "#E6E6E6" },
  buttonSolidStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  badgeStyles: {
    neutral: { color: "#000000", backgroundColor: "#E6E6E6" },
    info: { color: "#17476B", backgroundColor: "#DDEEFF" },
    success: { color: "#174E2B", backgroundColor: "#DFF2E2" },
    warning: { color: "#664600", backgroundColor: "#FFF0CC" },
    error: { color: "#8C2522", backgroundColor: "#FBE0DF" },
  },
  borderStyle: { color: "#000000" },
  cursorStyle: Object.freeze({
    colorMode: "inverse",
    shape: "block",
    color: "#000000",
    textColor: "#FFFFFF",
    blink: true,
    blinkIntervalMs: DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  }),
  rangeStyle: Object.freeze({
    surface: "rgba(0, 0, 0, 0.22)",
    border: "#000000",
    surfaceEffect: "tint",
  }),
  focusedSurfaceStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  hoveredItemStyle: { backgroundColor: "#E6E6E6" },
  selectedStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  secondaryStyle: { color: "#555555" },
  disabledStyle: { color: "#777777" },
  textSelectionStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  scrollThumbStyle: { color: "#000000" },
  scrollTrackStyle: { color: "#777777" },
});

export const CLASSIC_MAC_DARK_THEME: CellUiTheme = Object.freeze({
  ...CLASSIC_MAC_SHARED_THEME,
  background: "#000000",
  foreground: "#FFFFFF",
  markdownColors: Object.freeze({
    accent: CHARDESK_DARK_CONTENT_THEME.accent,
    link: CHARDESK_DARK_CONTENT_THEME.info,
    quote: CHARDESK_DARK_CONTENT_THEME.success,
    muted: CHARDESK_DARK_CONTENT_THEME["muted-foreground"],
    codeForeground: CHARDESK_DARK_CONTENT_THEME.info,
    codeBackground: CHARDESK_DARK_CONTENT_THEME.surface,
  }),
  surfaceStyle: { backgroundColor: "#000000" },
  elevatedSurfaceStyle: { backgroundColor: "#1A1A1A" },
  buttonSolidStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  badgeStyles: {
    neutral: { color: "#FFFFFF", backgroundColor: "#303030" },
    info: { color: "#B8E4FF", backgroundColor: "#12344B" },
    success: { color: "#B7EAC4", backgroundColor: "#143821" },
    warning: { color: "#FFE3A1", backgroundColor: "#47340B" },
    error: { color: "#FFC6C4", backgroundColor: "#4B1B1B" },
  },
  borderStyle: { color: "#FFFFFF" },
  cursorStyle: Object.freeze({
    colorMode: "inverse",
    shape: "block",
    color: "#FFFFFF",
    textColor: "#000000",
    blink: true,
    blinkIntervalMs: DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  }),
  rangeStyle: Object.freeze({
    surface: "rgba(255, 255, 255, 0.18)",
    border: "#FFFFFF",
    surfaceEffect: "contrast",
  }),
  focusedSurfaceStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  hoveredItemStyle: { backgroundColor: "#1A1A1A" },
  selectedStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  secondaryStyle: { color: "#AAAAAA" },
  disabledStyle: { color: "#888888" },
  textSelectionStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  scrollThumbStyle: { color: "#FFFFFF" },
  scrollTrackStyle: { color: "#888888" },
});

/** @alias */
export const DEFAULT_CELL_UI_THEME: CellUiTheme = CLASSIC_MAC_LIGHT_THEME;

const isDarkBackground = (color: string): boolean => {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(color.trim());
  const channels = hex
    ? hex[1]!.length === 3
      ? [...hex[1]!].map((part) => Number.parseInt(part + part, 16))
      : [0, 2, 4].map((offset) => Number.parseInt(hex[1]!.slice(offset, offset + 2), 16))
    : /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/iu.exec(color.trim())?.slice(1, 4).map(Number);
  return channels ? (channels[0]! * 299 + channels[1]! * 587 + channels[2]! * 114) / 1000 < 128 : false;
};

export const resolveCellUiTheme = (
  theme: CellUiThemeInput | undefined
): CellUiTheme => {
  const markdownDefaults = isDarkBackground(theme?.background ?? DEFAULT_CELL_UI_THEME.background)
    ? CLASSIC_MAC_DARK_THEME.markdownColors : CLASSIC_MAC_LIGHT_THEME.markdownColors;
  return {
    ...DEFAULT_CELL_UI_THEME,
    ...theme,
    markdownColors: { ...markdownDefaults, ...theme?.markdownColors },
  };
};
