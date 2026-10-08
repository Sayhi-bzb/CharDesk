import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type CellResizeHandleOrientation = "horizontal" | "vertical";

export type CellResizeHandle = Readonly<{
  value: number;
  dragging: boolean;
  props: Readonly<{
    role: "separator";
    tabIndex: 0;
    "aria-orientation": CellResizeHandleOrientation;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  }>;
}>;

export const useCellResizeHandle = (options: Readonly<{
  orientation: CellResizeHandleOrientation;
  value: number;
  min: number;
  max: number;
  cellSize: number;
  step?: number;
  onChange: (value: number) => void;
}>): CellResizeHandle => {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ coordinate: number; value: number; pointerId: number } | null>(null);
  const axis = options.orientation === "vertical" ? "x" : "y";
  const clamp = useCallback((value: number) => Math.max(options.min, Math.min(options.max, value)), [options.max, options.min]);
  const update = useCallback((value: number) => options.onChange(clamp(Math.round(value))), [clamp, options]);
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { coordinate: axis === "x" ? event.clientX : event.clientY, value: options.value, pointerId: event.pointerId };
    setDragging(true);
  }, [axis, options.value]);
  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const coordinate = axis === "x" ? event.clientX : event.clientY;
    update(start.value + (coordinate - start.coordinate) / options.cellSize);
  }, [axis, options.cellSize, update]);
  const finish = useCallback((event: PointerEvent<HTMLElement>) => {
    if (startRef.current?.pointerId !== event.pointerId) return;
    startRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const positive = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    const negative = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const step = options.step ?? 1;
    const next = event.key === "Home" ? options.min : event.key === "End" ? options.max
      : positive ? options.value + step : negative ? options.value - step : null;
    if (next === null) return;
    event.preventDefault();
    update(next);
  }, [axis, options.max, options.min, options.step, options.value, update]);
  return {
    value: options.value,
    dragging,
    props: {
      role: "separator", tabIndex: 0, "aria-orientation": options.orientation,
      "aria-valuemin": options.min, "aria-valuemax": options.max, "aria-valuenow": options.value,
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown,
    } as CellResizeHandle["props"],
  };
};
