import type { GridCell, Point } from "@/shared/types";
import { getCellOccupancy, splitGraphemes } from "@/shared/metrics";
import { normalizeCellStyle } from "@/shared/utils/ansi";
import type { StructuredNodeStyle } from "./types";

type TextLayoutRun = {
  char: string;
  offset: number;
  x: number;
  y: number;
  width: number;
};

type TextSurfaceCell = GridCell & {
  x: number;
  y: number;
  offset: number;
};

type TextLayout = {
  runs: TextLayoutRun[];
  lineWidths: number[];
};

export const createTextLayout = (text: string, origin: Point): TextLayout => {
  const runs: TextLayoutRun[] = [];
  const lineWidths: number[] = [0];
  let x = origin.x;
  let y = origin.y;
  let line = 0;
  let column = 0;

  splitGraphemes(text).forEach((char, offset) => {
    if (char === "\n") {
      lineWidths[line] = column;
      line += 1;
      lineWidths[line] = 0;
      x = origin.x;
      y += 1;
      column = 0;
      return;
    }
    const width = getCellOccupancy(char);
    runs.push({ char, offset, x, y, width });
    x += width;
    column += width;
    lineWidths[line] = column;
  });
  return { runs, lineWidths };
};

export const getTextLayoutSurfaceCells = (
  layout: TextLayout,
  styleForOffset: (offset: number) => StructuredNodeStyle
): TextSurfaceCell[] => {
  const cells: TextSurfaceCell[] = [];
  layout.runs.forEach((run) => {
    const style = styleForOffset(run.offset);
    cells.push({
      x: run.x,
      y: run.y,
      offset: run.offset,
      ...normalizeCellStyle({ char: run.char, ...style }),
    });
    for (let follower = 1; follower < run.width; follower += 1) {
      cells.push({
        x: run.x + follower,
        y: run.y,
        offset: run.offset,
        ...normalizeCellStyle({ char: " ", ...style }),
      });
    }
  });
  return cells;
};
