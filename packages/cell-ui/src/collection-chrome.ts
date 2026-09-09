import type { WidgetNode } from "./types.js";

/** Shared allocation for disclosure, selection and content; selection never reflows a row. */
export const collectionChromeMetrics = (node: WidgetNode) => {
  const disclosureOffset = Math.max(0, (node.level ?? 1) - 1) * 2;
  const selectionOffset = node.kind === "tree-item" ? disclosureOffset + 2 : 0;
  return { disclosureOffset, selectionOffset, contentInset: selectionOffset + 2 };
};
