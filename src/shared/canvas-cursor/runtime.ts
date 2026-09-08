import type { CharDeskCellCursorShape } from "@chardesk/rendering";

export const CANVAS_CURSOR_STORAGE_KEY = "chardesk-canvas-cursor-v1";
export const DEFAULT_CANVAS_CURSOR_PREFERENCE = Object.freeze({
  shape: "block",
  blink: true,
} satisfies CanvasCursorPreference);

export type CanvasCursorPreference = Readonly<{
  shape: CharDeskCellCursorShape;
  blink: boolean;
}>;

export type CanvasCursorStorage = Pick<Storage, "getItem" | "setItem">;

const isCursorShape = (value: unknown): value is CharDeskCellCursorShape =>
  value === "block" || value === "bar" || value === "underline";

const decodeCanvasCursorPreference = (value: unknown): CanvasCursorPreference => {
  if (!value || typeof value !== "object") return DEFAULT_CANVAS_CURSOR_PREFERENCE;
  const candidate = value as { shape?: unknown; blink?: unknown };
  if (!isCursorShape(candidate.shape) || typeof candidate.blink !== "boolean") {
    return DEFAULT_CANVAS_CURSOR_PREFERENCE;
  }
  return { shape: candidate.shape, blink: candidate.blink };
};

/** Host-owned visual preference; never enters Canvas document or history state. */
export function createCanvasCursorRuntime({
  storage = false,
}: {
  storage?: CanvasCursorStorage | false;
} = {}) {
  let snapshot: CanvasCursorPreference = DEFAULT_CANVAS_CURSOR_PREFERENCE;
  let started = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publish = (next: CanvasCursorPreference) => {
    if (next.shape === snapshot.shape && next.blink === snapshot.blink) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
    try {
      if (storage) storage.setItem(CANVAS_CURSOR_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // The in-memory preference remains valid when browser storage is unavailable.
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setShape: (shape: CharDeskCellCursorShape) => {
      if (!disposed && isCursorShape(shape)) publish({ ...snapshot, shape });
    },
    setBlink: (blink: boolean) => {
      if (!disposed) publish({ ...snapshot, blink });
    },
    start: () => {
      if (started || disposed) return;
      started = true;
      try {
        const stored = storage && storage.getItem(CANVAS_CURSOR_STORAGE_KEY);
        if (stored) snapshot = decodeCanvasCursorPreference(JSON.parse(stored));
      } catch {
        snapshot = DEFAULT_CANVAS_CURSOR_PREFERENCE;
      }
      listeners.forEach((listener) => listener());
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
  };
}

export type CanvasCursorRuntime = ReturnType<typeof createCanvasCursorRuntime>;
