import type { FocusManager, WidgetCommand } from "./interaction.js";
import { commandForInput, getScrollRange, topModalOverlayId } from "./interaction.js";
import type { GestureCandidate, GestureSignal } from "./gestures.js";
import { getEventPath, hitTestCell } from "./scene.js";
import type { CellPoint, FrameSnapshot, WidgetId } from "./types.js";

export const resolvePointerAppearance = (frame: FrameSnapshot, point: CellPoint): {
  hoveredId: WidgetId | null; cursor: "default" | "pointer" | "text";
} => {
  const hit = hitTestCell(frame.scene, point);
  if (!hit) return { hoveredId: null, cursor: "default" };
  const path = getEventPath(frame.scene, hit.ownerId);
  const modalId = topModalOverlayId(frame.tree);
  if (modalId && !path.includes(modalId)) return { hoveredId: null, cursor: "default" };
  for (const id of path) {
    const node = frame.tree.nodes.get(id)!;
    if (node.disabled) return { hoveredId: null, cursor: "default" };
    if (node.kind === "text-input" || node.kind === "text-area") {
      const clip = frame.scene.entries.get(id)?.contentClip;
      return { hoveredId: null, cursor: clip && contains(clip, point) ? "text" : "default" };
    }
    if (["list-item", "menu-item", "tree-item", "tab", "grid-cell"].includes(node.kind)) {
      return { hoveredId: id, cursor: "pointer" };
    }
    if (node.kind === "overlay" || node.kind === "scroll-area") break;
  }
  return { hoveredId: null, cursor: "default" };
};

const contains = (bounds: Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>, point: CellPoint) => point.x >= bounds.x
  && point.y >= bounds.y
  && point.x < bounds.x + bounds.width
  && point.y < bounds.y + bounds.height;

export const gestureCandidatesForFrame = (
  frame: FrameSnapshot,
  path: readonly WidgetId[],
  point: CellPoint
): readonly GestureCandidate[] => {
  const item = path.find((id) => {
    const kind = frame.tree.nodes.get(id)?.kind;
    return kind === "list-item"
      || kind === "menu-item"
      || kind === "tree-item"
      || kind === "tab"
      || kind === "grid-cell";
  });
  const scroll = path.find((id) => frame.tree.nodes.get(id)?.kind === "scroll-area");
  const hit = hitTestCell(frame.scene, point);
  const metrics = scroll ? frame.scene.entries.get(scroll)?.scrollMetrics : null;
  const scrollbarPart = hit && hit.ownerId === scroll
    && (hit.part === "scrollbar-x" || hit.part === "scrollbar-y")
    ? hit.part
    : null;
  const onThumb = scrollbarPart === "scrollbar-x"
    ? !!metrics?.horizontalThumb && contains(metrics.horizontalThumb, point)
    : scrollbarPart === "scrollbar-y"
      ? !!metrics?.verticalThumb && contains(metrics.verticalThumb, point)
      : false;
  return [
    ...(item && !frame.tree.nodes.get(item)?.disabled
      ? [{ targetId: item, kind: "tap" as const }]
      : []),
    ...(scrollbarPart && scroll
      ? [
          { targetId: scroll, kind: "tap" as const, part: scrollbarPart },
          ...(onThumb
            ? [{
                targetId: scroll,
                kind: "drag" as const,
                axis: scrollbarPart === "scrollbar-x" ? "x" as const : "y" as const,
                part: scrollbarPart,
              }]
            : []),
        ]
      : scroll
        ? [{ targetId: scroll, kind: "scroll" as const, axis: "both" as const }]
        : []),
  ];
};

export const commandForGestureSignal = (
  frame: FrameSnapshot,
  signal: GestureSignal,
  focus: FocusManager
): WidgetCommand | null => {
  if (signal.kind === "tap" && signal.phase === "end") {
    const entry = frame.scene.entries.get(signal.targetId);
    const node = frame.tree.nodes.get(signal.targetId);
    if (node?.kind === "scroll-area" && entry?.scrollMetrics && signal.part) {
      const metrics = entry.scrollMetrics;
      const horizontal = signal.part === "scrollbar-x";
      const currentOffset = horizontal ? node.scrollOffset.x : node.scrollOffset.y;
      const thumb = horizontal ? metrics.horizontalThumb : metrics.verticalThumb;
      if (thumb && contains(thumb, signal.point)) return null;
      const coordinate = horizontal ? signal.point.x : signal.point.y;
      const thumbStart = horizontal ? thumb?.x : thumb?.y;
      const page = horizontal ? metrics.viewport.width : metrics.viewport.height;
      const range = getScrollRange(frame, signal.targetId);
      const next = currentOffset + (coordinate < (thumbStart ?? coordinate) ? -page : page);
      return {
        type: "scroll",
        targetId: signal.targetId,
        scrollX: horizontal
          ? Math.max(range.x.min, Math.min(range.x.max, next))
          : node.scrollOffset.x,
        scrollY: horizontal
          ? node.scrollOffset.y
          : Math.max(range.y.min, Math.min(range.y.max, next)),
      };
    }
    const command = commandForInput(
      { type: "pointer", phase: "up", point: signal.point, button: 0 },
      frame,
      focus
    );
    return command?.targetId === signal.targetId ? command : null;
  }
  if (
    signal.kind === "drag"
    && (signal.phase === "start" || signal.phase === "update")
    && signal.part
  ) {
    const node = frame.tree.nodes.get(signal.targetId);
    const metrics = frame.scene.entries.get(signal.targetId)?.scrollMetrics;
    if (!node || node.kind !== "scroll-area" || !metrics) return null;
    const horizontal = signal.part === "scrollbar-x";
    const track = horizontal ? metrics.horizontalTrack : metrics.verticalTrack;
    const thumb = horizontal ? metrics.horizontalThumb : metrics.verticalThumb;
    if (!track || !thumb) return null;
    const travel = horizontal ? track.width - thumb.width : track.height - thumb.height;
    const maximum = horizontal ? metrics.maxOffset.x : metrics.maxOffset.y;
    const cellDelta = horizontal ? signal.delta.x : signal.delta.y;
    const offsetDelta = travel > 0 ? Math.round(cellDelta * maximum / travel) : 0;
    return {
      type: "scroll",
      targetId: signal.targetId,
      scrollX: horizontal
        ? Math.max(0, Math.min(metrics.maxOffset.x, node.scrollOffset.x + offsetDelta))
        : node.scrollOffset.x,
      scrollY: horizontal
        ? node.scrollOffset.y
        : Math.max(0, Math.min(metrics.maxOffset.y, node.scrollOffset.y + offsetDelta)),
    };
  }
  if (
    signal.kind !== "scroll"
    || (signal.phase !== "start" && signal.phase !== "update")
    || (signal.delta.x === 0 && signal.delta.y === 0)
  ) return null;
  const node = frame.tree.nodes.get(signal.targetId);
  if (!node || node.kind !== "scroll-area") return null;
  const range = getScrollRange(frame, signal.targetId);
  const scrollX = Math.max(range.x.min, Math.min(range.x.max, node.scrollOffset.x - signal.delta.x));
  const scrollY = Math.max(range.y.min, Math.min(range.y.max, node.scrollOffset.y - signal.delta.y));
  return scrollX === node.scrollOffset.x && scrollY === node.scrollOffset.y
    ? null
    : { type: "scroll", targetId: signal.targetId, scrollX, scrollY };
};
