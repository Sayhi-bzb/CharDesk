export type {
  GridAddress,
  GridBounds,
  GridRange,
  GridSelectionState,
  StaticGridState,
  StaticGridInteraction,
  StaticGridTarget,
  StaticGridViewState,
} from './model/static-grid';
export type { StaticGridInputSession } from './model/static-grid-input-session';
export {
  advanceStaticGridInput,
  advanceStaticGridInputLine,
  createStaticGridInputSession,
} from './model/static-grid-input-session';
export type { StaticGridDeleteDirection, StaticGridDeletePlan } from './model/static-grid-deletion';
export { resolveStaticGridDeletePlan } from './model/static-grid-deletion';
export type {
  GridSelectionGeometry,
  GridSelectionCoverage,
  GridSelectionDragPreview,
} from './model/grid-selection-geometry';
export {
  forEachGridSelectionSpan,
  getGridSelectionGeometry,
  getGridSelectionCoverageGeometry,
  resolveGridSelectionCoverage,
  resolveGridSelectionPresentation,
  getGridSelectionSpans,
} from './model/grid-selection-geometry';
export {
  collapseGridSelectionTo,
  createGridSelectionState,
  createStaticGridState,
  extendGridSelectionTo,
  getConnectedGridRange,
  getEffectiveGridBounds,
  getStaticGridCursor,
  getStaticGridInputSession,
  getStaticGridSelection,
  getGridSelectionExtent,
  hasGridRangeSelection,
  getStaticGridSelectionAreas,
  getGridSelectionRanges,
  getStaticGridViewState,
  gridRangeFromSelectionArea,
  gridRangesEqual,
  moveGridAddress,
  moveGridAddressToContentBoundary,
  moveGridAddressToEdge,
  normalizeGridRange,
  selectionAreaFromGridRange,
  selectGridColumn,
  selectGridRange,
  selectGridRow,
} from './model/static-grid';
