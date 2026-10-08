import { useLayoutEffect, useState, type RefObject } from "react";
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { CellSize } from "./types.js";
import { DEFAULT_CELL_UI_METRICS } from "./browser-font-metrics.js";

export type CellViewportOptions = Readonly<{
  elementRef: RefObject<HTMLElement | null>;
  metrics?: CharDeskCellMetrics;
  guard?: number;
  minWidth?: number;
  minHeight?: number;
}>;
export type CellViewportState = Readonly<{ viewport: CellSize; metrics: CharDeskCellMetrics; ready: boolean }>;
const resolveViewport = (element: HTMLElement, metrics: CharDeskCellMetrics, guard: number, minWidth: number, minHeight: number): CellSize => ({
  width: Math.max(minWidth, Math.floor(element.getBoundingClientRect().width / metrics.cellWidth) - guard * 2),
  height: Math.max(minHeight, Math.floor(element.getBoundingClientRect().height / metrics.cellHeight) - guard * 2),
});
export const useCellViewport = (options: CellViewportOptions): CellViewportState => {
  const metrics = options.metrics ?? DEFAULT_CELL_UI_METRICS;
  const guard = Math.max(0, Math.trunc(options.guard ?? 1));
  const minWidth = Math.max(1, Math.trunc(options.minWidth ?? 1));
  const minHeight = Math.max(1, Math.trunc(options.minHeight ?? 1));
  const [viewport, setViewport] = useState<CellSize>({ width: minWidth, height: minHeight });
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const element = options.elementRef.current;
    if (!element) return;
    const measure = () => { const next = resolveViewport(element, metrics, guard, minWidth, minHeight); setViewport((current) => current.width === next.width && current.height === next.height ? current : next); setReady(true); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [guard, metrics, minHeight, minWidth, options.elementRef]);
  return { viewport, metrics, ready };
};
