import type { CellCursorStyle } from "./theme.js";
import type { CellTextStyle } from "./types.js";

export const resolveCellCursorStyle = (
  cell: CellTextStyle | undefined,
  palette: Readonly<{ color: string; background: string }>,
  cursor: CellCursorStyle,
): CellCursorStyle => {
  if (cursor.colorMode === "fixed") return cursor;
  return {
    ...cursor,
    color: cell?.color ?? palette.color,
    textColor: cell?.backgroundColor ?? palette.background,
  };
};
