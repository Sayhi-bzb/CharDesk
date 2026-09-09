import type { CellTextStyle } from "./types.js";
import type { CellBorderShape } from "./border.js";
import type { SeparatorVariant } from "./separator.js";
import {
  DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  type CharDeskCellCursorPaintStyle,
  type CharDeskCellRangePaintStyle,
  type CharDeskCellCursorShape,
} from "@chardesk/rendering";

export type CellCursorShape = CharDeskCellCursorShape;
export type SeparatorGlyphs = Readonly<Record<
  SeparatorVariant,
  Readonly<Record<"horizontal" | "vertical", string>>
>>;

export type CellCursorStyle = CharDeskCellCursorPaintStyle & Readonly<{
  colorMode?: "inverse" | "fixed";
  blink: boolean;
  blinkIntervalMs: number;
}>;

export type CellUiTheme = Readonly<{
  background: string;
  foreground: string;
  surfaceStyle: CellTextStyle;
  buttonPrimaryStyle: CellTextStyle;
  buttonPrimaryHoverStyle: CellTextStyle;
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
  progressFilledTrack: string;
  progressEmptyTrack: string;
  separatorGlyphs: SeparatorGlyphs;
  checkboxIndeterminateIndicator: string;
  sliderFilledTrack: string;
  sliderEmptyTrack: string;
  sliderThumb: string;
  sliderEmphasizedThumb: string;
  selectExpandedIndicator: string;
  selectCollapsedIndicator: string;
  selectSelectedIndicator: string;
  tabUnderline: string;
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
  progressFilledTrack: "█",
  progressEmptyTrack: "░",
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
  tabUnderline: "▬",
  focusedItemStyle: { bold: true },
});

export const CLASSIC_MAC_LIGHT_THEME: CellUiTheme = Object.freeze({
  ...CLASSIC_MAC_SHARED_THEME,
  background: "#FFFFFF",
  foreground: "#000000",
  surfaceStyle: { backgroundColor: "#FFFFFF" },
  buttonPrimaryStyle: { color: "#FFFFFF", backgroundColor: "#000000" },
  buttonPrimaryHoverStyle: { color: "#FFFFFF", backgroundColor: "#1A1A1A" },
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
  surfaceStyle: { backgroundColor: "#000000" },
  buttonPrimaryStyle: { color: "#000000", backgroundColor: "#FFFFFF" },
  buttonPrimaryHoverStyle: { color: "#000000", backgroundColor: "#E6E6E6" },
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

export const DEFAULT_CELL_UI_THEME: CellUiTheme = CLASSIC_MAC_LIGHT_THEME;

export const resolveCellUiTheme = (
  theme: Partial<CellUiTheme> | undefined
): CellUiTheme => ({
  ...DEFAULT_CELL_UI_THEME,
  ...theme,
});
