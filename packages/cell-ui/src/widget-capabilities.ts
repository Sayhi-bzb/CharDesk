import type { WidgetKind, WidgetNode } from "./types.js";

const collectionItemKinds = new Set<WidgetKind>([
  "list-item",
  "menu-item",
  "tree-item",
  "tab",
  "grid-cell",
  "select-item",
]);

const selectableKinds = new Set<WidgetKind>([
  "list-item",
  "tree-item",
  "tab",
  "grid-cell",
  "select-item",
]);

export const isCollectionItemKind = (kind: WidgetKind): boolean =>
  collectionItemKinds.has(kind);

export const isSelectableKind = (kind: WidgetKind): boolean =>
  selectableKinds.has(kind);

export const isTextEditorKind = (kind: WidgetKind): boolean =>
  kind === "text-input" || kind === "text-area";

export const isActionableKind = (kind: WidgetKind): boolean =>
  kind === "button"
  || kind === "checkbox"
  || kind === "slider"
  || kind === "select-trigger"
  || isCollectionItemKind(kind);

export const isFocusableKind = (kind: WidgetKind): boolean =>
  isActionableKind(kind) || isTextEditorKind(kind);

export const isPortalKind = (kind: WidgetKind): boolean =>
  kind === "overlay" || kind === "select-content";

export const isFocusScope = (node: WidgetNode): boolean =>
  (node.kind === "overlay" && node.modal) || node.kind === "select-content";

export const isDismissableScope = (node: WidgetNode): boolean =>
  (node.kind === "overlay" && node.modal) || node.kind === "select-content";

export const isFilledSurfaceKind = (kind: WidgetKind): boolean =>
  kind === "overlay" || kind === "select-content";
