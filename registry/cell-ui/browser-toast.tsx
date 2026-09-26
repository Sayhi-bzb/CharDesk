import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCellOverlayLayer } from "./browser-overlay-host.js";

export type CellToastEntry = Readonly<{
  id: string;
  content: ReactNode;
  durationMs?: number;
}>;

export type CellToastState = Readonly<{
  toasts: readonly CellToastEntry[];
  push: (entry: CellToastEntry) => void;
  dismiss: (id: string) => void;
}>;

/** Applications own toast content; this hook only owns queue lifetime. */
export function useCellToastState(): CellToastState {
  const [toasts, setToasts] = useState<readonly CellToastEntry[]>([]);
  const push = useCallback((entry: CellToastEntry) => {
    setToasts((current) => [...current.filter((item) => item.id !== entry.id), entry]);
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  return useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
}

function TimedToast({ entry, dismiss }: Readonly<{
  entry: CellToastEntry;
  dismiss: (id: string) => void;
}>) {
  useEffect(() => {
    if (!entry.durationMs || entry.durationMs <= 0) return;
    const timer = window.setTimeout(() => dismiss(entry.id), entry.durationMs);
    return () => window.clearTimeout(timer);
  }, [dismiss, entry.durationMs, entry.id]);
  return <div data-cell-toast={entry.id} role="status" style={{ pointerEvents: "auto" }}>
    {entry.content}
  </div>;
}

/** Portals CellSurface-based notices above every surface without stealing focus. */
export function CellToastViewport({ state }: Readonly<{ state: CellToastState }>) {
  const layer = useCellOverlayLayer();
  if (!layer || state.toasts.length === 0) return null;
  return createPortal(<div data-cell-toast-viewport=""
    style={{ position: "fixed", right: 8, bottom: 8, display: "grid", gap: 4,
      pointerEvents: "none", maxWidth: "calc(100vw - 16px)" }}>
    {state.toasts.map((entry) => <TimedToast key={entry.id} entry={entry} dismiss={state.dismiss} />)}
  </div>, layer);
}
