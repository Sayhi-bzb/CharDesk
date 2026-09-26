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
  codeKey: string;
  codeValue: string;
  codeCommand: string;
  codeComment: string;
}>;

export type CellSemanticTone = "info" | "success" | "warning" | "danger";
export type CellSemanticToneColors = Readonly<{
  text: string;
  surface: string;
  surfaceForeground: string;
}>;
export type CellSemanticColors = Readonly<Record<CellSemanticTone, CellSemanticToneColors>>;

export type CellUiThemeInput = Omit<Partial<CellUiTheme>, "markdownColors" | "semanticColors" | "badgeStyles"> & Readonly<{
  markdownColors?: Partial<CellMarkdownColors>;
  semanticColors?: Partial<Record<CellSemanticTone, Partial<CellSemanticToneColors>>>;
  badgeStyles?: Partial<Record<BadgeTone, CellTextStyle>>;
}>;

export type CellUiTheme = Readonly<{
  background: string;
  foreground: string;
  semanticColors: CellSemanticColors;
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

const LIGHT_SEMANTIC_COLORS: CellSemanticColors = Object.freeze({
  info: { text: CHARDESK_LIGHT_CONTENT_THEME.info, surface: "#DDEEFF", surfaceForeground: "#17476B" },
  success: { text: CHARDESK_LIGHT_CONTENT_THEME.success, surface: "#DFF2E2", surfaceForeground: "#174E2B" },
  warning: { text: CHARDESK_LIGHT_CONTENT_THEME.warning, surface: "#FFF0CC", surfaceForeground: "#664600" },
  danger: { text: CHARDESK_LIGHT_CONTENT_THEME.danger, surface: "#FBE0DF", surfaceForeground: "#8C2522" },
});

const DARK_SEMANTIC_COLORS: CellSemanticColors = Object.freeze({
  info: { text: CHARDESK_DARK_CONTENT_THEME.info, surface: "#12344B", surfaceForeground: "#B8E4FF" },
  success: { text: CHARDESK_DARK_CONTENT_THEME.success, surface: "#143821", surfaceForeground: "#B7EAC4" },
  warning: { text: CHARDESK_DARK_CONTENT_THEME.warning, surface: "#47340B", surfaceForeground: "#FFE3A1" },
  danger: { text: CHARDESK_DARK_CONTENT_THEME.danger, surface: "#4B1B1B", surfaceForeground: "#FFC6C4" },
});

const badgeStylesFromSemanticColors = (
  semanticColors: CellSemanticColors,
  neutral: CellTextStyle,
): CellUiTheme["badgeStyles"] => ({
  neutral,
  info: { color: semanticColors.info.surfaceForeground, backgroundColor: semanticColors.info.surface },
  success: { color: semanticColors.success.surfaceForeground, backgroundColor: semanticColors.success.surface },
  warning: { color: semanticColors.warning.surfaceForeground, backgroundColor: semanticColors.warning.surface },
  error: { color: semanticColors.danger.surfaceForeground, backgroundColor: semanticColors.danger.surface },
});

const markdownColorsFromSemanticColors = (
  semanticColors: CellSemanticColors,
  content: typeof CHARDESK_LIGHT_CONTENT_THEME,
): CellMarkdownColors => ({
  accent: content.accent,
  link: semanticColors.info.text,
  quote: semanticColors.success.text,
  muted: content["muted-foreground"],
  codeForeground: semanticColors.info.text,
  codeBackground: content.surface,
  ...(content === CHARDESK_DARK_CONTENT_THEME
    ? { codeKey: "#79c0ff", codeValue: "#7ee787", codeCommand: "#d2a8ff", codeComment: "#999999" }
    : { codeKey: "#0550ae", codeValue: "#116329", codeCommand: "#8250df", codeComment: "#666666" }),
});

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
  semanticColors: LIGHT_SEMANTIC_COLORS,
  markdownColors: markdownColorsFromSemanticColors(LIGHT_SEMANTIC_COLORS, CHARDESK_LIGHT_CONTENT_THEME),
  surfaceStyle: { backgroundColor: "#FFFFFF" },
  elevatedSurfaceStyle: { backgroundColor: "#E6E6E6" },
  buttonSolidStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  badgeStyles: badgeStylesFromSemanticColors(LIGHT_SEMANTIC_COLORS, { color: "#000000", backgroundColor: "#E6E6E6" }),
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
  semanticColors: DARK_SEMANTIC_COLORS,
  markdownColors: markdownColorsFromSemanticColors(DARK_SEMANTIC_COLORS, CHARDESK_DARK_CONTENT_THEME),
  surfaceStyle: { backgroundColor: "#000000" },
  elevatedSurfaceStyle: { backgroundColor: "#1A1A1A" },
  buttonSolidStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  badgeStyles: badgeStylesFromSemanticColors(DARK_SEMANTIC_COLORS, { color: "#FFFFFF", backgroundColor: "#303030" }),
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
  const defaults = isDarkBackground(theme?.background ?? DEFAULT_CELL_UI_THEME.background)
    ? CLASSIC_MAC_DARK_THEME : CLASSIC_MAC_LIGHT_THEME;
  const semanticColors = Object.fromEntries(
    (Object.keys(defaults.semanticColors) as CellSemanticTone[]).map((tone) => [
      tone, { ...defaults.semanticColors[tone], ...theme?.semanticColors?.[tone] },
    ]),
  ) as CellSemanticColors;
  const markdownDefaults = markdownColorsFromSemanticColors(
    semanticColors,
    defaults === CLASSIC_MAC_DARK_THEME ? CHARDESK_DARK_CONTENT_THEME : CHARDESK_LIGHT_CONTENT_THEME,
  );
  const badgeDefaults = badgeStylesFromSemanticColors(semanticColors, defaults.badgeStyles.neutral);
  return {
    ...DEFAULT_CELL_UI_THEME,
    ...theme,
    semanticColors,
    markdownColors: { ...markdownDefaults, ...theme?.markdownColors },
    badgeStyles: {
      ...badgeDefaults,
      ...theme?.badgeStyles,
    },
  };
};
