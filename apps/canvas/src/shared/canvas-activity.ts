import { useSyncExternalStore } from "react";

export type CanvasActivityMarker = Readonly<{
  id: string;
  canvasId: string;
  pageId?: string;
  bounds: readonly [number, number, number, number];
  label: string;
  createdAt: number;
}>;

const listeners = new Set<() => void>();
const ACTIVITY_STORAGE_KEY = "chardesk.canvas-activity.v1";
const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let sequence = 0;

type CanvasActivityMessage =
  | { type: "publish"; marker: CanvasActivityMarker }
  | { type: "clear"; id: string };

// Activity is intentionally ephemeral, but it must cross same-origin Canvas
// tabs. The MCP bridge can be attached to a different tab than the one the
// human is looking at. BroadcastChannel keeps the marker out of document
// persistence while making that tab boundary transparent.
const activityChannel = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel("chardesk:canvas-activity")
  : null;

const isMarker = (value: unknown): value is CanvasActivityMarker => {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<CanvasActivityMarker>;
  return typeof marker.id === "string"
    && typeof marker.canvasId === "string"
    && (marker.pageId === undefined || typeof marker.pageId === "string")
    && Array.isArray(marker.bounds)
    && marker.bounds.length === 4
    && marker.bounds.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    && typeof marker.label === "string"
    && typeof marker.createdAt === "number"
    && Number.isFinite(marker.createdAt);
};

const loadMarkers = (): readonly CanvasActivityMarker[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - ACTIVITY_RETENTION_MS;
    return parsed.filter((value): value is CanvasActivityMarker =>
      isMarker(value) && value.createdAt >= cutoff
    ).slice(-32);
  } catch {
    return [];
  }
};

const persistMarkers = (next: readonly CanvasActivityMarker[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable or full; the in-memory marker still works.
  }
};

let markers: readonly CanvasActivityMarker[] = loadMarkers();

const emit = () => listeners.forEach((listener) => listener());

const upsertMarker = (marker: CanvasActivityMarker) => {
  markers = [...markers.filter((entry) => entry.id !== marker.id), marker].slice(-32);
  persistMarkers(markers);
  emit();
};

activityChannel?.addEventListener("message", (event: MessageEvent<CanvasActivityMessage>) => {
  const message = event.data;
  if (message?.type === "publish" && message.marker?.id && message.marker.canvasId) {
    upsertMarker(message.marker);
  } else if (message?.type === "clear" && typeof message.id === "string") {
    const next = markers.filter((marker) => marker.id !== message.id);
    if (next.length !== markers.length) {
      markers = next;
      persistMarkers(markers);
      emit();
    }
  }
});

export const publishCanvasActivity = (input: {
  canvasId: string;
  pageId?: string;
  bounds: readonly [number, number, number, number];
  operationId?: string;
  label?: string;
}) => {
  const id = input.operationId ?? `agent-${Date.now()}-${sequence++}`;
  const marker: CanvasActivityMarker = {
    id,
    canvasId: input.canvasId,
    ...(input.pageId ? { pageId: input.pageId } : {}),
    bounds: input.bounds,
    label: input.label ?? "Agent update",
    createdAt: Date.now(),
  };
  upsertMarker(marker);
  activityChannel?.postMessage({ type: "publish", marker } satisfies CanvasActivityMessage);
  return id;
};

export const markCanvasActivityRead = (id: string) => {
  const next = markers.filter((marker) => marker.id !== id);
  if (next.length === markers.length) return;
  markers = next;
  persistMarkers(markers);
  emit();
  activityChannel?.postMessage({ type: "clear", id } satisfies CanvasActivityMessage);
};

export const clearCanvasActivity = (id: string) => markCanvasActivityRead(id);

export const subscribeCanvasActivity = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCanvasActivitySnapshot = () => markers;

export const useCanvasActivity = () => useSyncExternalStore(
  subscribeCanvasActivity,
  getCanvasActivitySnapshot,
  getCanvasActivitySnapshot,
);
