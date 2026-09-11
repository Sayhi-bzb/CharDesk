import type { CellBuffer } from "./buffer.js";
import type { CellRect, CellTextStyle, WidgetId } from "./types.js";

export type CellBorderShape = "square" | "rounded";
export type CellBlockVariant = "plain" | "raised" | "bordered";

export const resolveCellBlockVariant = (
  variant: unknown,
  fallback: CellBlockVariant = "plain",
): CellBlockVariant => variant === "plain" || variant === "raised" || variant === "bordered"
  ? variant
  : fallback;

const corners = {
  square: ["┌", "┐", "└", "┘"],
  rounded: ["╭", "╮", "╰", "╯"],
} as const;

export const paintBorder = (
  buffer: CellBuffer,
  ownerId: WidgetId,
  bounds: CellRect,
  shape: CellBorderShape,
  style: CellTextStyle,
  clip: CellRect
): void => {
  if (bounds.width < 2 || bounds.height < 2) return;
  const [topLeft, topRight, bottomLeft, bottomRight] = corners[shape];
  const right = bounds.x + bounds.width - 1;
  const bottom = bounds.y + bounds.height - 1;
  buffer.writeGrapheme(bounds.x, bounds.y, topLeft, ownerId, style, clip, "over");
  buffer.writeGrapheme(right, bounds.y, topRight, ownerId, style, clip, "over");
  buffer.writeGrapheme(bounds.x, bottom, bottomLeft, ownerId, style, clip, "over");
  buffer.writeGrapheme(right, bottom, bottomRight, ownerId, style, clip, "over");
  for (let x = bounds.x + 1; x < right; x += 1) {
    buffer.writeGrapheme(x, bounds.y, "─", ownerId, style, clip, "over");
    buffer.writeGrapheme(x, bottom, "─", ownerId, style, clip, "over");
  }
  for (let y = bounds.y + 1; y < bottom; y += 1) {
    buffer.writeGrapheme(bounds.x, y, "│", ownerId, style, clip, "over");
    buffer.writeGrapheme(right, y, "│", ownerId, style, clip, "over");
  }
};
