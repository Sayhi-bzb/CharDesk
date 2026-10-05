export {
  CanvasPersistenceTimeoutError,
  CanvasRuntime,
  createCanvasRuntime,
} from "./runtime";
export { CANVAS_PERSISTENCE_FLUSH_TIMEOUT_MS } from "./runtime";
export {
  readCanvasViewport,
  renderCanvasViewportImage,
  isCanvasReadViewport,
} from "./readViewport";
export { searchCanvasSurface, isCanvasSearchQuery, isCanvasSearchPosition, CanvasSearchError } from "./searchSurface";
export type { CanvasSearchPosition, CanvasSearchMatch, CanvasSearchResult, CanvasSearchOptions } from "./searchSurface";
export {
  CanvasWriteError,
  prepareCanvasErase,
  prepareCanvasPlainTextWrite,
  prepareCanvasRowsWrite,
  prepareCanvasTextWrite,
} from "./writeText";
export type {
  CanvasStrokeStyle,
  CanvasWriteMode,
  CanvasWriteStats,
} from "./writeText";
export type { CanvasReadViewport, CanvasReadProjection, CanvasReadOptions } from "./readViewport";
export type { CanvasSessionMaterialization } from "./runtime";
export { CanvasViewportRuntime, normalizeCanvasViewport } from "./viewportRuntime";
export type { CanvasViewportPort } from "./viewportRuntime";
export {
  CanvasRuntimeProvider,
  useCanvasPersistence,
  useCanvasPersistenceSelector,
  useCanvasAnchors,
  useCanvasRuntime,
  useCanvasState,
  useCanvasViewport,
} from "./react";
export type { CanvasState, CanvasStateStore } from "./state/interfaces";
export type { CanvasAnchor } from "./state/canvasAnchorModel";
export {
  getCanvasAnchorBranchIds,
  getCanvasAnchorDepth,
  moveCanvasAnchor,
  readCanvasAnchorLabel,
} from "./state/canvasAnchorModel";
export { createEmptyCanvasInteraction } from "./state/canvasInteractionState";
export type {
  CanvasColorPickerTarget,
  CanvasInteractionSnapshot,
  CanvasInteractionUpdate,
} from "./state/canvasInteractionState";
export type {
  CanvasContentSurfaceState,
  PendingCanvasCameraPlacement,
  CanvasViewportState,
  ClipboardCommandResult,
} from "./state/interfaces";
export type {
  RichTextCell,
  RichTextRow,
  RichTextSpan,
} from "./state/textCommandTypes";
export type {
  SelectionCommandFactory,
  SelectionCommandContext,
  SelectionCommands,
  SelectionMutationPort,
} from "./state/selectionCommandPort";
export { isToolAllowedForMode } from "./model/tool";
export type { ToolType } from "./model/tool";
export { DEFAULT_DEMO_GRID } from "./state/helpers/defaultDemo";
export type { CanvasHistoryCheckpoint } from "./state/CanvasDocumentRegistry";
export type {
  CanvasPersistenceStatus,
  CanvasRestoreFailureReason,
} from "./state/browserPersistence";
export {
  CellPlaneIndex,
  cellPlanePatchToOperation,
  gridEntriesToCellPlaneOperation,
  isIncrementalCanvasSurfaceReader,
} from "./cell-plane/model";
export type {
  CanvasSurfaceChanges,
  CanvasSurfaceReader,
  CellPlaneOperation,
  CellPlanePatch,
  CellPlaneRow,
  CellRowMutation,
  GridInterval,
  IncrementalCanvasSurfaceReader,
  StyledCellSpan,
} from "./cell-plane/model";
export { createGridSurfaceReader } from "./cell-plane/model";
export {
  createStaticGridRangeMovePlan,
  isPointInStaticGridRange,
} from "./cell-plane/rangeMove";
export type {
  StaticGridRangeMoveMaskSpan,
  StaticGridRangeMovePlan,
} from "./cell-plane/rangeMove";
export {
  materializeSlideDeckContent,
  readSlideDeckDescriptor,
} from "./state/slideDocumentPages";
export type {
  CanvasDocumentAddress,
  CanvasDocumentDraft,
  CanvasPageDescriptor,
  CanvasPageDraft,
} from "./state/canvasDocumentModel";
