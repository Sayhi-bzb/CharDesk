import { readCanvasAnchorLabel } from "@/domains/canvas/public";
import {
  getGridSelectionSpans,
  type GridSelectionState,
} from "@/domains/selection/public";
import type { GridCellSource, Point } from "@/shared/types";
import { getGridCellWidth, resolveGridAnchor } from "@/shared/utils/grid-occupancy";

export type CanvasAnchorTarget = { point: Point; label: string };

export const resolveCanvasAnchorTarget = (
  source: GridCellSource,
  selection: GridSelectionState,
  clickedPoint?: Point
): CanvasAnchorTarget | null => {
  const spans = selection.mode === "range"
    ? getGridSelectionSpans([selection.primaryRange], source)
    : [];
  const useRange = spans.length > 0 && (!clickedPoint || spans.some((span) =>
    span.y === clickedPoint.y && clickedPoint.x >= span.minX && clickedPoint.x <= span.maxX
  ));

  if (useRange) {
    let first: Point | null = null;
    for (const span of spans) {
      for (let x = span.minX; x <= span.maxX; x += 1) {
        const cell = source.get({ x, y: span.y });
        if (cell?.char.trim()) {
          first = { x, y: span.y };
          break;
        }
      }
      if (first) break;
    }
    if (!first) return null;
    const lines: string[] = [];
    let remaining = 160;
    for (const span of spans) {
      if (remaining <= 0) break;
      if (span.y < first.y) continue;
      let line = "";
      for (let x = span.y === first.y ? first.x : span.minX;
        x <= span.maxX && remaining > 0;) {
        const cell = source.get({ x, y: span.y });
        line += cell?.char ?? " ";
        const width = cell ? getGridCellWidth(cell) : 1;
        x += width;
        remaining -= width;
      }
      if (line.trim()) lines.push(line.trim());
    }
    const label = lines.join(" ");
    return label ? { point: first, label } : null;
  }

  const point = resolveGridAnchor(source, clickedPoint ?? selection.activeCell);
  const label = readCanvasAnchorLabel(source, point);
  return label ? { point, label } : null;
};
