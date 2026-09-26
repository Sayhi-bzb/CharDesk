import type { WidgetNode, WidgetTree } from "./types.js";

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
