import type { ComponentType } from "react";
import type { CanvasRuntime, CanvasState } from "@/domains/canvas/public";
import type { ToolType } from "@/domains/canvas/public";
import type {
  EditorCommandCompletion,
  EditorCommandResult,
} from "@/domains/editor/public";

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

export type SidebarActionId =
  | "toggle-grid"
  | "toggle-sidebar"
  | "open-source-code";

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

export interface ActionContext {
  state: CanvasState;
  canvas: Pick<CanvasRuntime, "commands" | "queries" | "getState">;
  setTool: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export type ActionHandler<T = unknown> = (
  options: T,
  context: ActionContext
) => ActionResult;

export type ActionChecker = (state: CanvasState) => boolean;

export type ContextMenuEntry =
  | { type: "action"; id: EditorActionId }
  | { type: "separator" }
  | {
      type: "submenu";
      label: string;
      icon?: ComponentType<{ className?: string }>;
      children: ContextMenuEntry[];
    };
