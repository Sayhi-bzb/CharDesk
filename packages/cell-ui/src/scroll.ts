import { thumbAxis, thumbCellSpan } from "./scrollbar.js";
import type { CellPoint, CellRect, CellSize, FrameSnapshot, ScrollMetrics, WidgetId, WidgetNode } from "./types.js";
import type { WidgetCommand } from "./interaction.js";

export const scrollCommandForOffset = (frame: FrameSnapshot, targetId: WidgetId, offset: CellPoint): WidgetCommand | null => {
  const node = frame.tree.nodes.get(targetId);
  const metrics = frame.scene.entries.get(targetId)?.scrollMetrics;
  if (!node || node.disabled || !metrics) return null;
  const x = Math.max(0, Math.min(metrics.maxOffset.x, Math.trunc(offset.x)));
  const y = Math.max(0, Math.min(metrics.maxOffset.y, Math.trunc(offset.y)));
  const current = scrollOffsetFor(node);
  if (x === current.x && y === current.y) return null;
  return node.textEditor
    ? { type: "text", targetId, command: { type: "set-scroll", x, y } }
    : { type: "scroll", targetId, scrollX: x, scrollY: y };
};

export const scrollOffsetFor = (node: WidgetNode): CellPoint => node.textEditor
  ? { x: node.textEditor.scrollX, y: node.textEditor.scrollY }
  : node.scrollOffset;

export const computeScrollMetrics = (
  contentBounds: CellRect,
  extent: CellSize,
  offset: CellPoint,
  rails: Readonly<{ x: boolean; y: boolean }>,
  fitWidth = false
): ScrollMetrics => {
  let horizontal = false;
  let vertical = false;
  for (let pass = 0; pass < 3; pass += 1) {
    horizontal = rails.x && contentBounds.height > 1
      && extent.width > Math.max(0, contentBounds.width - (vertical ? 1 : 0));
    vertical = rails.y && contentBounds.width > 1
      && extent.height > Math.max(0, contentBounds.height - (horizontal ? 1 : 0));
  }
  const viewport: CellRect = {
    ...contentBounds,
    width: Math.max(0, contentBounds.width - (vertical ? 1 : 0)),
    height: Math.max(0, contentBounds.height - (horizontal ? 1 : 0)),
  };
  const horizontalTrack = horizontal
    ? { x: viewport.x, y: viewport.y + viewport.height, width: viewport.width, height: 1 }
    : null;
  const verticalTrack = vertical
    ? { x: viewport.x + viewport.width, y: viewport.y, width: 1, height: viewport.height }
    : null;
  const horizontalThumbAxis = horizontalTrack
    ? thumbAxis(horizontalTrack.width, viewport.width, extent.width, offset.x)
    : null;
  const verticalThumbAxis = verticalTrack
    ? thumbAxis(verticalTrack.height, viewport.height, extent.height, offset.y)
    : null;
  return {
    horizontalThumbAxis,
    verticalThumbAxis,
    viewport,
    contentSize: extent,
    maxOffset: {
      x: Math.max(0, (fitWidth ? viewport.width : extent.width) - viewport.width),
      y: Math.max(0, extent.height - viewport.height),
    },
    horizontalTrack,
    verticalTrack,
    horizontalThumb: horizontalTrack && horizontalThumbAxis
      ? { ...horizontalTrack, x: horizontalTrack.x + thumbCellSpan(horizontalThumbAxis).start, width: thumbCellSpan(horizontalThumbAxis).length }
      : null,
    verticalThumb: verticalTrack && verticalThumbAxis
      ? { ...verticalTrack, y: verticalTrack.y + thumbCellSpan(verticalThumbAxis).start, height: thumbCellSpan(verticalThumbAxis).length }
      : null,
    corner: horizontal && vertical
      ? { x: viewport.x + viewport.width, y: viewport.y + viewport.height, width: 1, height: 1 }
      : null,
  };
};
