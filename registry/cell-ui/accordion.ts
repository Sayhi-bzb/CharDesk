import type { WidgetNode, WidgetTree } from "./types.js";

export const accordionItem = (tree: WidgetTree, id: string | null): WidgetNode | undefined => {
  let node = id ? tree.nodes.get(id) : undefined;
  while (node && node.kind !== "accordion-item") node = node.parentId ? tree.nodes.get(node.parentId) : undefined;
  return node;
};

export const isAccordionHidden = (tree: WidgetTree, node: WidgetNode): boolean => {
  let current: WidgetNode | undefined = node;
  while (current) {
    if (current.kind === "accordion-content" && !current.expanded) return true;
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return false;
};

export const accordionTriggers = (tree: WidgetTree, groupId: string): WidgetNode[] =>
  (tree.nodes.get(groupId)?.children ?? []).flatMap((id) => {
    const item = tree.nodes.get(id);
    return (item?.children ?? []).map((child) => tree.nodes.get(child)!)
      .filter((node) => node.kind === "accordion-trigger");
  });

export const accordionFocusCandidates = (tree: WidgetTree, focusedId: string | null): string[] => {
  const candidates: string[] = [];
  let item = accordionItem(tree, focusedId);
  while (item?.parentId) {
    const headers = accordionTriggers(tree, item.parentId);
    const itemId = item.id;
    const index = headers.findIndex((node) => node.parentId === itemId);
    if (index >= 0) candidates.push(...[...headers.slice(index), ...headers.slice(0, index).reverse()].map((node) => node.id));
    item = accordionItem(tree, item.parentId);
  }
  return candidates;
};
