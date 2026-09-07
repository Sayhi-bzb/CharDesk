import type { FocusManager, WidgetCommand } from "./interaction.js";
import { commandForInput, getScrollRange, topModalOverlayId } from "./interaction.js";
import type { GestureCandidate, GestureSignal } from "./gestures.js";
import { getEventPath, hitTestCell } from "./scene.js";
import type { CellPoint, FrameSnapshot, WidgetId } from "./types.js";
import { cellCenter } from "./scrollbar.js";
import { scrollCommandForOffset, scrollOffsetFor } from "./scroll.js";

export const validGestureCandidate = (frame: FrameSnapshot, candidate: GestureCandidate): boolean => {
  const node = frame.tree.nodes.get(candidate.targetId);
  const entry = frame.scene.entries.get(candidate.targetId);
  if (!node || node.disabled || !entry?.paintVisible) return false;
  const anchor = candidate.scrollbar;
  if (!anchor) return true;
  const horizontal = candidate.part === "scrollbar-x";
  const metrics = entry.scrollMetrics;
  const track = horizontal ? metrics?.horizontalTrack : metrics?.verticalTrack;
  const thumb = horizontal ? metrics?.horizontalThumbAxis : metrics?.verticalThumbAxis;
  return !!track && !!thumb
    && anchor.maximum === (horizontal ? metrics?.maxOffset.x : metrics?.maxOffset.y)
    && anchor.trackStart === (horizontal ? track.x : track.y)
    && anchor.trackCross === (horizontal ? track.y : track.x)
    && anchor.trackLength === (horizontal ? track.width : track.height)
    && anchor.thumbLength === thumb.length;
};

export const resolvePointerAppearance = (frame: FrameSnapshot, point: CellPoint): {
  hoveredId: WidgetId | null; cursor: "default" | "pointer";
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
      return { hoveredId: null, cursor: "default" };
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
  point: CellPoint,
  precisePoint = cellCenter(point)
): readonly GestureCandidate[] => {
  const item = path.find((id) => {
    const kind = frame.tree.nodes.get(id)?.kind;
    return kind === "list-item"
      || kind === "menu-item"
      || kind === "tree-item"
      || kind === "tab"
      || kind === "grid-cell";
  });
  const scroll = path.find((id) => frame.scene.entries.get(id)?.scrollMetrics);
  const hit = hitTestCell(frame.scene, point);
  const metrics = scroll ? frame.scene.entries.get(scroll)?.scrollMetrics : null;
  const scrollbarPart = hit && hit.ownerId === scroll
    && (hit.part === "scrollbar-x" || hit.part === "scrollbar-y")
    ? hit.part
    : null;
  const horizontal = scrollbarPart === "scrollbar-x";
  const track = horizontal ? metrics?.horizontalTrack : metrics?.verticalTrack;
  const thumb = horizontal ? metrics?.horizontalThumbAxis : metrics?.verticalThumbAxis;
  const coordinate = horizontal ? precisePoint.x : precisePoint.y;
  const start = track ? (horizontal ? track.x : track.y) + (thumb?.start ?? 0) / 2 : 0;
  const onThumb = !!thumb && coordinate >= start && coordinate < start + thumb.length / 2;
  const scrollbar = scrollbarPart && metrics && track && thumb && scroll ? {
    point: precisePoint,
    offset: horizontal ? scrollOffsetFor(frame.tree.nodes.get(scroll)!).x : scrollOffsetFor(frame.tree.nodes.get(scroll)!).y,
    maximum: horizontal ? metrics.maxOffset.x : metrics.maxOffset.y,
    trackStart: horizontal ? track.x : track.y,
    trackCross: horizontal ? track.y : track.x,
    trackLength: horizontal ? track.width : track.height,
    thumbLength: thumb.length,
  } : undefined;
  return [
    ...(item && !frame.tree.nodes.get(item)?.disabled
      ? [{ targetId: item, kind: "tap" as const }]
      : []),
    ...(scrollbarPart && scroll
      ? [
          { targetId: scroll, kind: "tap" as const, part: scrollbarPart, scrollbar },
          ...(onThumb
            ? [{
                targetId: scroll,
                kind: "drag" as const,
                axis: scrollbarPart === "scrollbar-x" ? "x" as const : "y" as const,
                part: scrollbarPart,
                scrollbar,
              }]
            : []),
        ]
      : scroll && frame.tree.nodes.get(scroll)?.kind === "scroll-area"
        ? [{ targetId: scroll, kind: "scroll" as const, axis: "both" as const }]
        : []),
  ];
};

export const commandForGestureSignal = (
  frame: FrameSnapshot,
  signal: GestureSignal,
  focus: FocusManager
): WidgetCommand | null => {
  if (!validGestureCandidate(frame, signal)) return null;
  if (signal.kind === "tap" && signal.phase === "end") {
    const entry = frame.scene.entries.get(signal.targetId);
    const node = frame.tree.nodes.get(signal.targetId);
    if (node && entry?.scrollMetrics && signal.part) {
      const metrics = entry.scrollMetrics;
      const horizontal = signal.part === "scrollbar-x";
      const offset = scrollOffsetFor(node);
      const currentOffset = horizontal ? offset.x : offset.y;
      const thumb = horizontal ? metrics.horizontalThumbAxis : metrics.verticalThumbAxis;
      const track = horizontal ? metrics.horizontalTrack : metrics.verticalTrack;
      const precise = signal.precisePoint ?? cellCenter(signal.point);
      if (!track || !contains(track, precise)) return null;
      const coordinate = horizontal ? precise.x : precise.y;
      const thumbStart = (horizontal ? track?.x : track?.y) ?? 0;
      const start = thumbStart + (thumb?.start ?? 0) / 2;
      if (thumb && coordinate >= start && coordinate < start + thumb.length / 2) return null;
      const page = horizontal ? metrics.viewport.width : metrics.viewport.height;
      const next = currentOffset + (coordinate < start ? -page : page);
      return scrollCommandForOffset(frame, signal.targetId, { x: horizontal ? next : offset.x, y: horizontal ? offset.y : next });
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
    && (signal.phase === "start" || signal.phase === "update" || signal.phase === "end")
    && signal.part
  ) {
    const node = frame.tree.nodes.get(signal.targetId);
    const metrics = frame.scene.entries.get(signal.targetId)?.scrollMetrics;
    if (!node || !metrics) return null;
    const horizontal = signal.part === "scrollbar-x";
    const track = horizontal ? metrics.horizontalTrack : metrics.verticalTrack;
    const thumb = horizontal ? metrics.horizontalThumb : metrics.verticalThumb;
    if (!track || !thumb) return null;
    const anchor = signal.scrollbar;
    if (!anchor || !signal.totalDelta) return null;
    const travel = anchor.trackLength - anchor.thumbLength / 2;
    const cellDelta = horizontal ? signal.totalDelta.x : signal.totalDelta.y;
    const next = travel > 0 ? Math.round(anchor.offset + cellDelta * anchor.maximum / travel) : anchor.offset;
    const offset = scrollOffsetFor(node);
    return scrollCommandForOffset(frame, signal.targetId, { x: horizontal ? next : offset.x, y: horizontal ? offset.y : next });
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
