import type { CellPoint, CellRect, WidgetId } from "./types.js";

export type CellDragPhase = "idle" | "pending" | "dragging" | "dropping" | "cancelled";
export type CellDragPayload = Readonly<Record<string, unknown>>;
export type CellDragState = Readonly<{
  pointerId: number | null;
  sourceId: WidgetId | null;
  targetId: WidgetId | null;
  payload: CellDragPayload | null;
  point: CellPoint | null;
  origin: CellPoint | null;
  active: boolean;
  delta: CellPoint;
  phase: CellDragPhase;
}>;

export type CellDragEvent = Readonly<{
  type: "start" | "preview" | "commit" | "cancel";
  state: CellDragState;
}>;

export type CellDropTarget = Readonly<{
  id: WidgetId;
  bounds: CellRect;
  accepts?: readonly string[];
}>;

export const idleCellDragState = (): CellDragState => ({
  pointerId: null, sourceId: null, targetId: null, payload: null,
  point: null, origin: null, active: false, delta: { x: 0, y: 0 }, phase: "idle",
});

export const beginCellDrag = (
  pointerId: number, sourceId: WidgetId, payload: CellDragPayload | null, point: CellPoint,
): CellDragState => ({
  pointerId, sourceId, targetId: null, payload, point, origin: point, active: false, delta: { x: 0, y: 0 }, phase: "pending",
});

export const updateCellDrag = (
  state: CellDragState, point: CellPoint, targetId: WidgetId | null = state.targetId,
): CellDragState => {
  if (state.origin === null || state.phase === "idle" || state.phase === "dropping" || state.phase === "cancelled") return state;
  return { ...state, targetId, point, active: true, delta: { x: point.x - state.origin.x, y: point.y - state.origin.y }, phase: "dragging" };
};

export const commitCellDrag = (state: CellDragState): CellDragState => state.phase === "dragging" ? ({ ...state, active: false, phase: "dropping" }) : state;
export const cancelCellDrag = (state: CellDragState): CellDragState => state.phase === "pending" || state.phase === "dragging" ? ({ ...state, active: false, phase: "cancelled" }) : state;


/** Targets are ordered back-to-front; only accepted, visible rectangles participate. */
export const cellDropTargetAtPoint = (
  targets: readonly CellDropTarget[], point: CellPoint, payload: CellDragPayload | null,
): WidgetId | null => {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index]!;
    const { bounds } = target;
    if (point.x < bounds.x || point.y < bounds.y || point.x >= bounds.x + bounds.width
      || point.y >= bounds.y + bounds.height) continue;
    if (target.accepts && !target.accepts.includes(String(payload?.type ?? ""))) continue;
    return target.id;
  }
  return null;
};
