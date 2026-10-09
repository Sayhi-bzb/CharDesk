import type { FrameSnapshot, WidgetId, WidgetNode, WidgetTree } from "./types.js";

export const isWidgetHidden = (tree: WidgetTree, node: WidgetNode): boolean => {
  let current: WidgetNode | undefined = node;
  while (current) {
    if (current.hidden) return true;
    if ((current.kind === "accordion-content" || current.kind === "select-content"
      || current.kind === "combobox-content") && !current.expanded) return true;
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return false;
};

/** A mounted drag owner may be clipped while its pointer gesture is active. */
export const isMountedDragSource = (frame: FrameSnapshot, id: WidgetId): boolean => {
  const node = frame.tree.nodes.get(id);
  const entry = frame.scene.entries.get(id);
  if (!node?.drag || !entry || isWidgetHidden(frame.tree, node)
    || entry.layoutBounds.width <= 0 || entry.layoutBounds.height <= 0) return false;
  let current: WidgetNode | undefined = node;
  while (current) {
    if (current.disabled) return false;
    current = current.parentId ? frame.tree.nodes.get(current.parentId) : undefined;
  }
  return true;
};
