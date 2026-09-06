import { CHARDESK_CELL_EDGE, type CharDeskCellPrimitive } from "@chardesk/rendering";
import type { CellBuffer } from "./buffer.js";
import type { CellRect, CellTextStyle, WidgetId } from "./types.js";

export type CellBorderShape = "square" | "rounded";

const corners = {
  square: ["┌", "┐", "└", "┘"],
  rounded: ["╭", "╮", "╰", "╯"],
} as const;

const line = (
  edges: number,
  join: CellBorderShape
): CharDeskCellPrimitive => ({ kind: "line", edges, join, weight: "single" });

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
  buffer.writeGrapheme(bounds.x, bounds.y, topLeft, ownerId, style, clip, "over",
    line(CHARDESK_CELL_EDGE.right | CHARDESK_CELL_EDGE.bottom, shape));
  buffer.writeGrapheme(right, bounds.y, topRight, ownerId, style, clip, "over",
    line(CHARDESK_CELL_EDGE.left | CHARDESK_CELL_EDGE.bottom, shape));
  buffer.writeGrapheme(bounds.x, bottom, bottomLeft, ownerId, style, clip, "over",
    line(CHARDESK_CELL_EDGE.right | CHARDESK_CELL_EDGE.top, shape));
  buffer.writeGrapheme(right, bottom, bottomRight, ownerId, style, clip, "over",
    line(CHARDESK_CELL_EDGE.left | CHARDESK_CELL_EDGE.top, shape));
  for (let x = bounds.x + 1; x < right; x += 1) {
    const primitive = line(CHARDESK_CELL_EDGE.left | CHARDESK_CELL_EDGE.right, shape);
    buffer.writeGrapheme(x, bounds.y, "─", ownerId, style, clip, "over", primitive);
    buffer.writeGrapheme(x, bottom, "─", ownerId, style, clip, "over", primitive);
  }
  for (let y = bounds.y + 1; y < bottom; y += 1) {
    const primitive = line(CHARDESK_CELL_EDGE.top | CHARDESK_CELL_EDGE.bottom, shape);
    buffer.writeGrapheme(bounds.x, y, "│", ownerId, style, clip, "over", primitive);
    buffer.writeGrapheme(right, y, "│", ownerId, style, clip, "over", primitive);
  }
};
