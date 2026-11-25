import { useSyncExternalStore } from 'react';
import { CanvasActivityStore, type ActivityRange, type CanvasActivityMarker } from './canvas-activity/model';

export type { CanvasActivityMarker } from './canvas-activity/model';

const STORAGE_KEY = 'chardesk.canvas-activity.v2';
export const canvasActivityStore = new CanvasActivityStore();
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('chardesk:canvas-activity:v2') : null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

const restore = () => {
  try {
    canvasActivityStore.merge(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch { /* empty */ }
};

let stopPersistence: (() => void) | undefined;
const onStorage = (event: StorageEvent) => {
  if (event.key === STORAGE_KEY) restore();
};
if (typeof window !== 'undefined') {
  const persistAndSchedule = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(canvasActivityStore.getJournal()));
    } catch { /* empty */ }
    clearTimeout(expiryTimer);
    const remaining = canvasActivityStore.getExpiresAt() - Date.now();
    if (Number.isFinite(remaining)) expiryTimer = setTimeout(canvasActivityStore.refresh, Math.min(2_147_483_647, Math.max(1, remaining)));
  };
  stopPersistence = canvasActivityStore.subscribe(persistAndSchedule);
  restore();
  persistAndSchedule();
  window.addEventListener('storage', onStorage);
  channel?.addEventListener('message', (event) => {
    if (event.data?.type === 'sync') channel.postMessage(canvasActivityStore.getJournal());
    else canvasActivityStore.merge(event.data);
  });
  channel?.postMessage({ type: 'sync' });
  try { window.localStorage.removeItem('chardesk.canvas-activity.v1'); } catch { /* empty */ }
}

export const recordCanvasActivity = (input: Parameters<CanvasActivityStore['record']>[0]) => {
  if (typeof window !== 'undefined') restore();
  const event = canvasActivityStore.record(input);
  channel?.postMessage({ floor: canvasActivityStore.getJournal().floor, events: [event] });
};

export const acknowledgeCanvasActivity = (marker: CanvasActivityMarker, ranges: readonly ActivityRange[]) => {
  recordCanvasActivity({ kind: 'seen', changes: marker.changes, ranges });
};

export const useCanvasActivity = () => useSyncExternalStore(
  canvasActivityStore.subscribe, canvasActivityStore.getSnapshot, canvasActivityStore.getSnapshot,
);

if (import.meta.hot) import.meta.hot.dispose(() => {
  channel?.close();
  clearTimeout(expiryTimer);
  stopPersistence?.();
  window.removeEventListener('storage', onStorage);
});
