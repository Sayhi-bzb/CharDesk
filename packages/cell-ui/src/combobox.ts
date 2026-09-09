import type { KeyInput } from "@chardesk/keyboard";
import type { WidgetCommand } from "./interaction.js";
import type { WidgetNode, WidgetTree } from "./types.js";

export const comboboxOwner = (tree: WidgetTree, node: WidgetNode): WidgetNode | undefined => {
  let current: WidgetNode | undefined = node;
  while (current && current.kind !== "combobox") {
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return current;
};

export const comboboxParts = (tree: WidgetTree, input: WidgetNode) => {
  const owner = comboboxOwner(tree, input);
  const content = owner?.children.map((id) => tree.nodes.get(id))
    .find((node) => node?.kind === "combobox-content");
  const items = content?.children.map((id) => tree.nodes.get(id)!)
    .filter((node) => node.kind === "combobox-item" && !node.disabled) ?? [];
  return { owner, content, items };
};

export const commandForComboboxKey = (
  tree: WidgetTree,
  input: WidgetNode,
  key: Pick<KeyInput, "key">
): WidgetCommand | null => {
  if (input.kind !== "combobox-input" || input.textEditor?.composition) return null;
  const { content, items } = comboboxParts(tree, input);
  if (key.key === "Escape" && content) return { type: "dismiss", targetId: content.id };
  if (key.key === "Enter") {
    if (!input.expanded) return { type: "set-expanded", targetId: input.id, expanded: true };
    return input.activeDescendantId && items.some(({ id }) => id === input.activeDescendantId)
      ? { type: "activate", targetId: input.activeDescendantId }
      : null;
  }
  if (key.key !== "ArrowDown" && key.key !== "ArrowUp") return null;
  if (!input.expanded) return { type: "set-expanded", targetId: input.id, expanded: true };
  if (items.length === 0) return null;
  const current = items.findIndex(({ id }) => id === input.activeDescendantId);
  const delta = key.key === "ArrowDown" ? 1 : -1;
  const next = current < 0
    ? (delta > 0 ? 0 : items.length - 1)
    : Math.max(0, Math.min(items.length - 1, current + delta));
  return next === current ? null : { type: "set-active", targetId: items[next]!.id };
};
