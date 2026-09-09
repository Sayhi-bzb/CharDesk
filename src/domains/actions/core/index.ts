// Types
export type {
  ActionResult,
  EditorActionId,
  EditorCommandId,
  ToolbarActionId,
  ContextMenuEntry,
} from './types';

// Catalog
export {
  APP_ACTION_META,
  EDITOR_COMMAND_META,
  TOOLBAR_ACTION_META,
  CANVAS_CONTEXT_MENU,
} from './catalog';

// Runtime
export { createEditorCommands, createEditorCommandsExtension } from './runtime';
export type { EditorCommandOptions } from './runtime';
export { isActionAccepted } from './result';

export {
  getAppActionShortcutLabel,
  getAppActionShortcuts,
  getEditorCommandShortcutLabel,
  formatShortcutLabel,
  getShortcutDisplayStrokes,
  setEditorCommandShortcutOverride,
} from './shortcuts';
export type { ShortcutDisplayStroke, ShortcutPlatform } from './shortcuts';

// Handlers (for advanced use cases)
export { resolveActiveToolbarAction } from './handlers';
