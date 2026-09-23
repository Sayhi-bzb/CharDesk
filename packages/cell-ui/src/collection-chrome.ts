import type { WidgetNode } from "./types.js";

/** Shared allocation for guards, disclosure, selection and content. */
export const collectionChromeMetrics = (node: WidgetNode) => {
  const leadingGuard = 1;
  const trailingGuard = 1;
  const disclosureOffset = leadingGuard + Math.max(0, (node.level ?? 1) - 1) * 2;
  const selectionOffset = node.kind === "tree-item" ? disclosureOffset + 2 : leadingGuard;
  return { leadingGuard, trailingGuard, disclosureOffset, selectionOffset, contentInset: selectionOffset + 2 };
};

/** Fit decoration into narrow explicit widths without painting over an indicator. */
export const collectionChromeGeometry = (node: WidgetNode, width: number) => {
  const metrics = collectionChromeMetrics(node);
  const shift = width <= metrics.selectionOffset ? metrics.leadingGuard : 0;
  return {
    leadingGuardOffset: shift === 0 && width > 0 ? 0 : null,
    trailingGuardOffset: width > metrics.contentInset ? width - 1 : null,
    disclosureOffset: metrics.disclosureOffset - shift,
    selectionOffset: metrics.selectionOffset - shift,
  };
};
