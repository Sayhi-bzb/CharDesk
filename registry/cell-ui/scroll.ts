import { thumbAxis, thumbCellSpan } from "./scrollbar.js";
import type { CellPoint, CellRect, CellSize, FrameSnapshot, ScrollMetrics, WidgetId, WidgetNode } from "./types.js";
import type { WidgetCommand } from "./interaction.js";

export const scrollCommandForOffset = (frame: FrameSnapshot, targetId: WidgetId, offset: CellPoint): WidgetCommand | null => {
  const node = frame.tree.nodes.get(targetId);
  const metrics = frame.scene.entries.get(targetId)?.scrollMetrics;
  if (!node || node.disabled || !metrics) return null;
  const { x, y } = clampScrollOffset(offset, metrics);
  const current = scrollOffsetFor(node);
  if (x === current.x && y === current.y) return null;
  return node.textEditor
    ? { type: "text", targetId, command: { type: "set-scroll", x, y } }
    : { type: "scroll", targetId, scrollX: x, scrollY: y };
};

export const scrollOffsetFor = (node: WidgetNode): CellPoint => node.textEditor
  ? { x: node.textEditor.scrollX, y: node.textEditor.scrollY }
  : node.scrollOffset;

export const clampScrollOffset = (offset: CellPoint, metrics: ScrollMetrics): CellPoint => ({
  x: Math.max(0, Math.min(metrics.maxOffset.x, Math.trunc(offset.x))),
  y: Math.max(0, Math.min(metrics.maxOffset.y, Math.trunc(offset.y))),
});

export const scrollViewportCommands = (frame: FrameSnapshot): readonly WidgetCommand[] => {
  const commands: WidgetCommand[] = [];
  for (const [id, entry] of frame.scene.entries) {
    const node = frame.tree.nodes.get(id);
    if (!entry.scrollMetrics || !node || node.textEditor) continue;
    const offset = clampScrollOffset(node.scrollOffset, entry.scrollMetrics);
    if (offset.x !== node.scrollOffset.x || offset.y !== node.scrollOffset.y) {
      commands.push({ type: "scroll", targetId: id, scrollX: offset.x, scrollY: offset.y });
    }
  }
  return commands;
};

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
  const maxOffset = {
    x: Math.max(0, (fitWidth ? viewport.width : extent.width) - viewport.width),
    y: Math.max(0, extent.height - viewport.height),
  };
  const effectiveOffset = {
    x: Math.max(0, Math.min(maxOffset.x, offset.x)),
    y: Math.max(0, Math.min(maxOffset.y, offset.y)),
  };
  const horizontalTrack = horizontal
    ? { x: viewport.x, y: viewport.y + viewport.height, width: viewport.width, height: 1 }
    : null;
  const verticalTrack = vertical
    ? { x: viewport.x + viewport.width, y: viewport.y, width: 1, height: viewport.height }
    : null;
  const horizontalThumbAxis = horizontalTrack
    ? thumbAxis(horizontalTrack.width, viewport.width, extent.width, effectiveOffset.x)
    : null;
  const verticalThumbAxis = verticalTrack
    ? thumbAxis(verticalTrack.height, viewport.height, extent.height, effectiveOffset.y)
    : null;
  return {
    horizontalThumbAxis,
    verticalThumbAxis,
    viewport,
    contentSize: extent,
    maxOffset,
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
