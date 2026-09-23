import type { CellCheckboxState } from "./types.js";

export const nextCellCheckboxState = (
  state: CellCheckboxState
): CellCheckboxState => state !== true;
