import type { CellTextStyle } from "./types.js";
import type { CellBorderShape } from "./border.js";
import {
  DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  type CharDeskCellCursorPaintStyle,
  type CharDeskCellRangePaintStyle,
  type CharDeskCellCursorShape,
} from "@chardesk/rendering";

export type CellCursorShape = CharDeskCellCursorShape;

export type CellCursorStyle = CharDeskCellCursorPaintStyle & Readonly<{
  blink: boolean;
  blinkIntervalMs: number;
}>;

export type CellUiTheme = Readonly<{
  background: string;
  foreground: string;
  surfaceStyle: CellTextStyle;
  borderStyle: CellTextStyle;
  borderShape: CellBorderShape;
  cursorStyle: CellCursorStyle;
  rangeStyle: CharDeskCellRangePaintStyle;
  treeExpandedIndicator: string;
  treeCollapsedIndicator: string;
  checkboxUncheckedIndicator: string;
  checkboxCheckedIndicator: string;
  checkboxIndeterminateIndicator: string;
  sliderFilledTrack: string;
  sliderEmptyTrack: string;
  sliderThumb: string;
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

export const DEFAULT_CELL_UI_THEME: CellUiTheme = Object.freeze({
  background: "#101419",
  foreground: "#e8edf2",
  surfaceStyle: { backgroundColor: "#191d22" },
  borderStyle: { color: "#555555" },
  borderShape: "square",
  cursorStyle: Object.freeze({
    shape: "block",
    color: "#e8edf2",
    textColor: "#101419",
    blink: true,
    blinkIntervalMs: DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS,
  }),
  rangeStyle: Object.freeze({
    surface: "rgba(82, 155, 255, 0.32)",
    border: "#529bff",
  }),
  treeExpandedIndicator: "▾",
  treeCollapsedIndicator: "▸",
  checkboxUncheckedIndicator: " ",
  checkboxCheckedIndicator: "x",
  checkboxIndeterminateIndicator: "-",
  sliderFilledTrack: "━",
  sliderEmptyTrack: "─",
  sliderThumb: "┃",
  selectExpandedIndicator: "▴",
  selectCollapsedIndicator: "▾",
  selectSelectedIndicator: "✓",
  tabUnderline: "▬",
  focusedSurfaceStyle: { color: "#FFFFFF", backgroundColor: "#1a1a1a" },
  hoveredItemStyle: { backgroundColor: "#25292e" },
  focusedItemStyle: { bold: true },
  selectedStyle: { color: "#FFFFFF", backgroundColor: "#1a1a1a" },
  secondaryStyle: { color: "#888888" },
  disabledStyle: { color: "#666666" },
  textSelectionStyle: { color: "#FFFFFF", backgroundColor: "#264F78" },
  scrollThumbStyle: { color: "#888888" },
  scrollTrackStyle: { color: "#222222" },
});

export const resolveCellUiTheme = (
  theme: Partial<CellUiTheme> | undefined
): CellUiTheme => ({ ...DEFAULT_CELL_UI_THEME, ...theme });

export type CellVisualState = Readonly<{
  hovered?: boolean;
  focused?: boolean;
  selected?: boolean;
  disabled?: boolean;
  collection?: boolean;
}>;

export const resolveCellStateStyle = (
  local: CellTextStyle,
  state: CellVisualState,
  theme: CellUiTheme
): CellTextStyle => ({
  ...local,
  ...(state.hovered && state.collection && !state.focused && !state.selected && !state.disabled ? theme.hoveredItemStyle : {}),
  ...(state.focused && !state.selected ? theme.focusedSurfaceStyle : {}),
  ...(state.selected ? theme.selectedStyle : {}),
  ...(state.focused && state.collection ? theme.focusedItemStyle : {}),
  ...(state.disabled ? theme.disabledStyle : {}),
});

export const resolveCellTextStyle = (
  base: CellTextStyle,
  state: Readonly<{ selected?: boolean; composing?: boolean }>,
  theme: CellUiTheme
): CellTextStyle => ({
  ...base,
  ...(state.selected ? theme.textSelectionStyle : {}),
  ...(state.composing ? { underline: true } : {}),
});
