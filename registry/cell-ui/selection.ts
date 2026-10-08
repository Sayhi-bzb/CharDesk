import type { WidgetId } from "./types.js";

export type CellSelectionState = Readonly<{
  selectedIds: readonly WidgetId[];
  anchorId: WidgetId | null;
  focusedId: WidgetId | null;
}>;

export const emptyCellSelection = (): CellSelectionState => ({
  selectedIds: [], anchorId: null, focusedId: null,
});

export const selectCellId = (
  state: CellSelectionState,
  id: WidgetId,
  options: Readonly<{ additive?: boolean; range?: readonly WidgetId[] }> = {},
): CellSelectionState => {
  const range = options.range?.length ? options.range : [id];
  const selected = options.additive
    ? [...new Set([...state.selectedIds, ...range])]
    : [...range];
  return { selectedIds: selected, anchorId: state.anchorId ?? id, focusedId: id };
};

export const toggleCellSelection = (state: CellSelectionState, id: WidgetId): CellSelectionState => {
  const selected = state.selectedIds.includes(id)
    ? state.selectedIds.filter((item) => item !== id)
    : [...state.selectedIds, id];
  return { selectedIds: selected, anchorId: state.anchorId ?? id, focusedId: id };
};

export const clearCellSelection = (state: CellSelectionState): CellSelectionState => ({
  selectedIds: [], anchorId: null, focusedId: state.focusedId,
});

