import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { CellPresentationRegistry } from "./browser-presentation.js";
import { CELL_SURFACE_GUARD_CELLS } from "./browser-presentation.js";
import { resolvePointerAppearance } from "./pointer.js";
import { getEventPath, hitTestCell } from "./scene.js";
import type { FrameSnapshot } from "./types.js";

const empty = { hoveredId: null, cursor: "default", scrollbarHoverId: null } as const;

export const usePointerAppearance = (
  canvasRef: CellPresentationRegistry,
  frame: FrameSnapshot | null,
  metrics: { cellWidth: number; cellHeight: number }
) => {
  const position = useRef<{ clientX: number; clientY: number } | null>(null);
  const suspended = useRef(false);
  const [appearance, setAppearance] = useState<ReturnType<typeof resolvePointerAppearance> & {
    scrollbarHoverId: string | null;
  }>(empty);
  const clear = useCallback(() => {
    suspended.current = false;
    position.current = null;
    setAppearance((value) => value.hoveredId === null && value.scrollbarHoverId === null
      && value.cursor === "default" ? value : empty);
  }, []);
  const refresh = useCallback(() => {
    const canvas = canvasRef.current;
    const point = position.current;
    let next: ReturnType<typeof resolvePointerAppearance> & { scrollbarHoverId: string | null } = empty;
    if (canvas && frame && point && !suspended.current) {
      const bounds = canvas.getBoundingClientRect();
      if (canvasRef.acceptsPoint(point.clientX, point.clientY)) {
        const cell = {
          x: Math.floor((point.clientX - bounds.left) / metrics.cellWidth) - CELL_SURFACE_GUARD_CELLS,
          y: Math.floor((point.clientY - bounds.top) / metrics.cellHeight) - CELL_SURFACE_GUARD_CELLS,
        };
        const hit = hitTestCell(frame.scene, cell);
        const scrollbarHoverId = hit ? getEventPath(frame.scene, hit.ownerId)
          .find((id) => frame.scene.entries.get(id)?.scrollMetrics) ?? null : null;
        next = { ...resolvePointerAppearance(frame, cell), scrollbarHoverId };
      }
    }
    setAppearance((value) => value.hoveredId === next.hoveredId
      && value.scrollbarHoverId === next.scrollbarHoverId && value.cursor === next.cursor ? value : next);
  }, [canvasRef, frame, metrics.cellWidth, metrics.cellHeight]);
  useLayoutEffect(() => {
    refresh();
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("blur", clear);
    };
  }, [refresh, clear]);
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    position.current = { clientX: event.clientX, clientY: event.clientY };
    refresh();
  };
  return {
    ...appearance,
    move,
    clear,
    suspend: () => { clear(); suspended.current = true; },
    resume: (event: PointerEvent) => { suspended.current = false; move(event); },
  };
};
