import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";

export type CellTextGlyphPlacement = Readonly<{
  segment: string;
  offset: number;
  column: number;
  row: number;
  width: number;
}>;

/** Shared Cell geometry for measuring and painting ordinary multiline text. */
export const walkCellTextRows = (
  text: string,
  widthLimit: number,
  onGlyph?: (placement: CellTextGlyphPlacement) => boolean | void,
): Readonly<{ width: number; height: number }> => {
  let column = 0;
  let row = 0;
  let widest = 0;
  for (const { index, segment } of iterateGraphemes(text)) {
    if (segment === "\n") {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
      continue;
    }
    const width = getGraphemeCellWidth(segment);
    if (column > 0 && column + width > widthLimit) {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
    }
    if (onGlyph?.({ segment, offset: index, column, row, width }) === false) break;
    column += width;
  }
  return { width: Math.max(widest, column), height: row + 1 };
};
