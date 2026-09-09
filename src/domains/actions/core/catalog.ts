import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import type {
  ActionMeta,
  ContextMenuEntry,
  EditorActionId,
  SidebarActionId,
  ToolbarActionId,
} from "./types";

// Editor Actions
export const EDITOR_COMMAND_META: Record<EditorActionId, ActionMeta<EditorActionId>> = {
  undo: { id: "undo", label: "Undo", shortcuts: [["mod", "z"]] },
  redo: {
    id: "redo",
    label: "Redo",
    shortcuts: [["mod", "shift", "z"], ["mod", "y"]],
  },
  copy: {
    id: "copy",
    label: "Copy as Text",
    icon: HOST_ICONOLOGY.editorAction.copy,
    shortcuts: [["mod", "c"]],
  },
  "copy-rich": {
    id: "copy-rich",
    label: "Copy with Color",
    icon: HOST_ICONOLOGY.editorAction["copy-rich"],
  },
  "copy-ansi": {
    id: "copy-ansi",
    label: "Copy as ANSI",
    icon: HOST_ICONOLOGY.editorAction["copy-ansi"],
  },
  cut: {
    id: "cut",
    label: "Cut Zone",
    icon: HOST_ICONOLOGY.editorAction.cut,
    shortcuts: [["mod", "x"]],
  },
  paste: {
    id: "paste",
    label: "Paste Lot",
    icon: HOST_ICONOLOGY.editorAction.paste,
    shortcuts: [["mod", "v"]],
  },
  "fill-selection-char": { id: "fill-selection-char", label: "Fill Selection" },
  "snapshot-png": {
    id: "snapshot-png",
    label: "Snapshot (PNG)",
    icon: HOST_ICONOLOGY.editorAction["snapshot-png"],
  },
  "delete-selection": {
    id: "delete-selection",
    label: "Delete",
    icon: HOST_ICONOLOGY.editorAction["delete-selection"],
    destructive: true,
    shortcuts: [["backspace"], ["delete"]],
  },
  "format-bold": {
    id: "format-bold",
    label: "Bold",
    shortcuts: [["mod", "b"]],
  },
  "format-italic": {
    id: "format-italic",
    label: "Italic",
    shortcuts: [["mod", "i"]],
  },
  "format-underline": {
    id: "format-underline",
    label: "Underline",
    shortcuts: [["mod", "u"]],
  },
  "format-strike": {
    id: "format-strike",
    label: "Strikethrough",
    shortcuts: [["mod", "shift", "x"]],
  },
  "format-inverse": {
    id: "format-inverse",
    label: "Inverse",
    shortcuts: ["mod+k i"],
  },
};

export const TOOLBAR_ACTION_META: Record<ToolbarActionId, ActionMeta<ToolbarActionId>> = {
  select: {
    id: "select",
    label: "Select",
    icon: HOST_ICONOLOGY.toolbarAction.select,
  },
  text: {
    id: "text",
    label: "Text",
    icon: HOST_ICONOLOGY.toolbarAction.text,
  },
  brush: {
    id: "brush",
    label: "Brush",
    icon: HOST_ICONOLOGY.toolbarAction.brush,
    hasSub: true,
  },
  "shape-group": {
    id: "shape-group",
    label: "Shape",
    icon: HOST_ICONOLOGY.toolbarAction["shape-group"],
    hasSub: true,
  },
  bg: {
    id: "bg",
    label: "Background",
    icon: HOST_ICONOLOGY.toolbarAction.bg,
  },
  fill: {
    id: "fill",
    label: "Paint Char Color",
    icon: HOST_ICONOLOGY.toolbarAction.fill,
  },
  eraser: {
    id: "eraser",
    label: "Eraser",
    icon: HOST_ICONOLOGY.toolbarAction.eraser,
  },
  undo: {
    ...EDITOR_COMMAND_META.undo,
    id: "undo",
    icon: HOST_ICONOLOGY.toolbarAction.undo,
  },
  pan: {
    id: "pan",
    label: "Hand",
    icon: HOST_ICONOLOGY.toolbarAction.pan,
  },
};

// Sidebar Actions
export const APP_ACTION_META: Record<SidebarActionId, ActionMeta<SidebarActionId>> = {
  "toggle-grid": { id: "toggle-grid", label: "Toggle Grid" },
  "toggle-sidebar": {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    shortcuts: ["mod+k b"],
  },
  "open-source-code": { id: "open-source-code", label: "Open Source Code" },
};

// Unified Action Catalog
// Context Menu Configuration
export const CANVAS_CONTEXT_MENU: ContextMenuEntry[] = [
  { type: "action", id: "copy" },
  { type: "action", id: "copy-ansi" },
  { type: "action", id: "snapshot-png" },
  { type: "action", id: "paste" },
  { type: "separator" },
  { type: "action", id: "delete-selection" },
];
