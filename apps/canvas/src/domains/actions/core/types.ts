import type { ComponentType } from "react";
import type { CanvasRuntime, CanvasState } from "@/domains/canvas/public";
import type { ToolType } from "@/domains/canvas/public";
import type {
  EditorCommandCompletion,
  EditorCommandResult,
} from "@/domains/editor/public";

// Editor Actions
export type EditorActionId =
  | "undo"
  | "redo"
  | "copy"
  | "copy-rich"
  | "copy-ansi"
  | "cut"
  | "paste"
  | "fill-selection-char"
  | "snapshot-png"
  | "delete-selection"
  | "format-bold"
  | "format-italic"
  | "format-underline"
  | "format-strike"
  | "format-inverse";

export type EditorCommandId = EditorActionId;

// Toolbar Actions
export type ToolbarActionId =
  | "select"
  | "pan"
  | "text"
  | "brush"
  | "shape-group"
  | "bg"
  | "fill"
  | "eraser"
  | "undo";

// Sidebar Actions
export type SidebarActionId =
  | "toggle-grid"
  | "toggle-sidebar"
  | "open-source-code";

// Unified Action ID
export type ActionId = EditorActionId | ToolbarActionId | SidebarActionId;

export type ShortcutToken = string;

type ShortcutChord = readonly ShortcutToken[];
type ShortcutDefinition = ShortcutChord | string;

export interface ActionMeta<Id extends ActionId = ActionId> {
  id: Id;
  label: string;
  shortcuts?: readonly ShortcutDefinition[];
  icon?: ComponentType<{ className?: string }>;
  hasSub?: boolean;
  destructive?: boolean;
}

// Action Source
export type ActionSource =
  | "keyboard"
  | "toolbar"
  | "context-menu"
  | "sidebar"
  | "inspector"
  | "canvas-keydown"
  | "global-hotkey"
  | "clipboard-event";

export type ActionCompletion = EditorCommandCompletion;

export type ActionResult = EditorCommandResult;

// Action Context
export interface ActionContext {
  state: CanvasState;
  canvas: Pick<CanvasRuntime, "commands" | "queries" | "getState">;
  setTool: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
}

// Action Handler
export type ActionHandler<T = unknown> = (
  options: T,
  context: ActionContext
) => ActionResult;

// Action Checker
export type ActionChecker = (state: CanvasState) => boolean;

// Context Menu Entry
export type ContextMenuEntry =
  | { type: "action"; id: EditorActionId }
  | { type: "separator" }
  | {
      type: "submenu";
      label: string;
      icon?: ComponentType<{ className?: string }>;
      children: ContextMenuEntry[];
    };
