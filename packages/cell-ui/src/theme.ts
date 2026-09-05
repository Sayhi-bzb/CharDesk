import type { CellTextStyle } from "./types.js";

export type CellUiTheme = Readonly<{
  background: string;
  foreground: string;
  surfaceStyle: CellTextStyle;
  borderStyle: CellTextStyle;
  caretColor: string;
  rangeSelectionColor: string;
  treeExpandedIndicator: string;
  treeCollapsedIndicator: string;
  tabUnderline: string;
  scrollThumb: string;
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
  caretColor: "#e8edf2",
  rangeSelectionColor: "rgba(82, 155, 255, 0.32)",
  treeExpandedIndicator: "▾",
  treeCollapsedIndicator: "▸",
  tabUnderline: "▬",
  scrollThumb: "█",
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
