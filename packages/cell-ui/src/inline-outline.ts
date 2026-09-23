import type { WidgetNode } from "./types.js";

export const INLINE_OUTLINE_INSET = 1;

export const hasInlineOutline = (node: WidgetNode): boolean =>
  (node.kind === "button" && node.buttonVariant === "outline")
  || (node.kind === "progress" && node.progressVariant === "outline");

export const inlineOutlineEdges = (
  left: number,
  right: number,
): Readonly<{ left: number; right: number }> | null => right - left >= 2
  ? { left, right: right - 1 }
  : null;
