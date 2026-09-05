import { useCallback, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent } from "react";
import { resolvePointerAppearance } from "./pointer.js";
import type { FrameSnapshot } from "./types.js";

const empty = { hoveredId: null, cursor: "default" } as const;

export const usePointerAppearance = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  frame: FrameSnapshot | null,
  metrics: { cellWidth: number; cellHeight: number }
) => {
  const position = useRef<{ clientX: number; clientY: number } | null>(null);
  const suspended = useRef(false);
  const [appearance, setAppearance] = useState<ReturnType<typeof resolvePointerAppearance>>(empty);
  const clear = useCallback(() => {
    suspended.current = false;
    position.current = null;
    setAppearance((value) => value.hoveredId === null && value.cursor === "default" ? value : empty);
  }, []);
  const refresh = useCallback(() => {
    const canvas = canvasRef.current;
    const point = position.current;
    let next: ReturnType<typeof resolvePointerAppearance> = empty;
    if (canvas && frame && point && !suspended.current) {
      const bounds = canvas.getBoundingClientRect();
      const top = canvas.ownerDocument.elementFromPoint?.(point.clientX, point.clientY);
      if (!top || top === canvas) next = resolvePointerAppearance(frame, {
        x: Math.floor((point.clientX - bounds.left) / metrics.cellWidth),
        y: Math.floor((point.clientY - bounds.top) / metrics.cellHeight),
      });
    }
    setAppearance((value) => value.hoveredId === next.hoveredId && value.cursor === next.cursor ? value : next);
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
