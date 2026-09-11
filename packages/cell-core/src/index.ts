export {
  cellRectContainsPoint,
  intersectCellRects,
  normalizeCellRect,
} from "./geometry.js";
export type { CellPoint, CellRect, CellSize } from "./geometry.js";

export { formatCellFrame, isIncrementalCellSource } from "./frame.js";
export type {
  CellChanges,
  CellFrame,
  CellSource,
  CellTextProjection,
  CellVisitor,
  IncrementalCellSource,
} from "./frame.js";

export {
  getCellRangeBounds,
  normalizeCellRangeEndpoints,
  resolveCellRangeBounds,
  resolveCellRangeSpans,
} from "./range.js";
export type { CellRange, CellRangeTopology, CellRowSpan } from "./range.js";
