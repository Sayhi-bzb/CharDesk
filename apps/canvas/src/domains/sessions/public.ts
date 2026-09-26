export type {
  CanvasSourceBinding,
  CanvasImportSnapshot,
  CanvasSessionDescriptor,
  CanvasSessionRestoreRecord,
  CanvasSessionSnapshot,
  FreeformCanvasSessionDescriptor,
  FreeformCanvasImportSnapshot,
  SourceBackedCanvasSessionDescriptor,
  SourceBackedCanvasSessionSnapshot,
} from "./model";
export { isSourceBackedCanvasSession } from "./model";
export {
  getCanvasSessionDescriptor,
  getCanvasSessionFallbackSnapshot,
  getCanvasSessionRestoreRecord,
} from "./model";
export {
  createSessionId,
  normalizeSessionMode,
  resolveNextSessionName,
  withActiveCanvasSnapshot,
} from "./session-state";
export {
  EDITOR_PERSISTENCE_KEY,
  EDITOR_PERSISTENCE_VERSION,
  PREVIOUS_EDITOR_PERSISTENCE_VERSION,
  LEGACY_EDITOR_PERSISTENCE_VERSION,
  LEGACY_EDITOR_PERSISTENCE_KEY,
  decodePersistedEditorState,
  flattenPersistedEditorState,
  isPersistedEditorStateV7,
  migrateLegacyEditorPersistence,
  migratePersistedStateToV7,
  UnsupportedEditorPersistenceVersionError,
} from "./persistence";
export type { SessionCommands } from "./commands";
export type { CanvasMode, CanvasModeCapabilities, CanvasModeDefinition } from "./mode";
export { CANVAS_MODE_DEFINITIONS, getCanvasModeDefinition, isStaticGridMode } from "./mode";
export {
  CANVAS_CATALOG_DATABASE,
  CANVAS_CATALOG_MARKER_KEY,
  CANVAS_CATALOG_VERSION,
  CanvasCatalogOpenError,
  createIndexedDbCanvasCatalog,
} from "./indexedDbCatalog";
export type {
  CanvasCatalog,
  CanvasCatalogFailureReason,
  CanvasCatalogOpenOptions,
  CanvasCatalogPreferences,
  CanvasCatalogSession,
  CanvasCatalogSlide,
  CanvasCatalogSnapshot,
} from "./indexedDbCatalog";
