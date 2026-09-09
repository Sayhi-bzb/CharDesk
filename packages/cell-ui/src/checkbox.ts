import type { CellCheckboxState } from "./types.js";

export type CheckboxChromeMetrics = Readonly<{
  indicatorOffset: number;
  paddingLeft: number;
  paddingRight: number;
}>;

export const checkboxChromeMetrics = (hasContent: boolean): CheckboxChromeMetrics => hasContent
  ? { indicatorOffset: 0, paddingLeft: 4, paddingRight: 0 }
  : { indicatorOffset: 1, paddingLeft: 4, paddingRight: 1 };

export const nextCellCheckboxState = (
  state: CellCheckboxState
): CellCheckboxState => state !== true;
