import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import type { WidgetKind, WidgetNode, WidgetTree } from "./types.js";

const SINGLE_LINE_LABEL_OWNERS = new Set<WidgetKind>([
  "button", "badge", "badge-action", "checkbox", "toggle", "radio-item",
  "select-trigger", "select-item", "combobox-item", "tab",
]);

export const isSingleLineControlText = (tree: WidgetTree, node: WidgetNode): boolean => {
  if (node.kind !== "text") return false;
  let parent = node.parentId ? tree.nodes.get(node.parentId) : undefined;
  while (parent?.kind === "box") parent = parent.parentId ? tree.nodes.get(parent.parentId) : undefined;
  return parent !== undefined && SINGLE_LINE_LABEL_OWNERS.has(parent.kind);
};

export const singleLineText = (value: string): string => value.replace(/[\r\n\t]+/gu, " ");

export const cellTextWidth = (value: string): number =>
  [...iterateGraphemes(value)].reduce((width, { segment }) => width + getGraphemeCellWidth(segment), 0);

export const fitSingleLineText = (value: string, width: number): string => {
  if (width <= 0) return "";
  if (cellTextWidth(value) <= width) return value;
  let result = "";
  let used = 0;
  for (const { segment } of iterateGraphemes(value)) {
    const next = getGraphemeCellWidth(segment);
    if (used + next + 1 > width) break;
    result += segment;
    used += next;
  }
  return `${result}…`;
};
