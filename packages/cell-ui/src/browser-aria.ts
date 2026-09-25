import type { SemanticNode } from "./types.js";

/** One SemanticSnapshot relation is projected identically by the DOM and native editor adapters. */
export const ariaDescribedBy = (node: SemanticNode | undefined): string | undefined => {
  const ids = node?.describedByIds ?? (node?.describedById ? [node.describedById] : []);
  return ids.length ? ids.map((id) => `cell-semantic-${id}`).join(" ") : undefined;
};
