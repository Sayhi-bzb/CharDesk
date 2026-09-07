import { CHARDESK_SYSTEM_FONT_PROFILE } from "@chardesk/fonts";
import {
  getCharDeskCanvasFont, resolveCharDeskCanvasFontFace,
  type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import {
  DEFAULT_CHARDESK_CELL_METRICS,
  type CharDeskCellMetrics,
} from "@chardesk/rendering";
import { useMemo, useSyncExternalStore } from "react";

type FontMetricsSnapshot = Readonly<{
  metrics: CharDeskCellMetrics;
  source: "default" | "explicit";
  ready: boolean;
}>;

export const DEFAULT_CELL_UI_METRICS = DEFAULT_CHARDESK_CELL_METRICS;

const stores = new WeakMap<CharDeskFontProfile, Map<number, ReturnType<typeof createStore>>>();

const resolveDefaultMetrics = (fontSize: number): CharDeskCellMetrics => {
  const scale = fontSize / DEFAULT_CELL_UI_METRICS.fontSize;
  return {
    ...DEFAULT_CELL_UI_METRICS,
    cellWidth: DEFAULT_CELL_UI_METRICS.cellWidth * scale,
    cellHeight: DEFAULT_CELL_UI_METRICS.cellHeight * scale,
    baseline: DEFAULT_CELL_UI_METRICS.baseline * scale,
    fontSize,
  };
};

function createStore(profile: CharDeskFontProfile, fontSize: number) {
  let snapshot: FontMetricsSnapshot = {
    metrics: resolveDefaultMetrics(fontSize), source: "default", ready: false,
  };
  const listeners = new Set<() => void>();
  let pending: Promise<void> | undefined;
  let loaded = false;
  const publishReady = () => {
    if (snapshot.ready) return;
    snapshot = { ...snapshot, ready: true };
    for (const listener of listeners) listener();
  };
  const retryPendingLoad = () => { if (!loaded) void load().catch(() => undefined); };
  const load = () => pending ??= Promise.resolve().then(async () => {
    const face = resolveCharDeskCanvasFontFace({ grapheme: "0", route: "text", bold: false, italic: false, fontProfile: profile });
    const font = getCharDeskCanvasFont(snapshot.metrics, 1, {
      fontFamily: face.family, fontSizeScale: face.fontSizeScale,
    });
    // No faces is valid for system fonts; network/load failures must reject.
    await document.fonts?.load(font, "0Mg");
    loaded = true;
    publishReady();
  }).catch((error: unknown) => { pending = undefined; throw error; });
  return {
    getSnapshot: () => snapshot,
    load,
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        document.fonts?.addEventListener("loadingdone", retryPendingLoad);
        // A face may have loaded while no Surface was subscribed.
        if (!snapshot.ready) void load().catch(() => undefined);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) document.fonts?.removeEventListener("loadingdone", retryPendingLoad);
      };
    },
  };
}

const getStore = (profile: CharDeskFontProfile, fontSize: number) => {
  if (!Number.isFinite(fontSize) || fontSize <= 0) throw new RangeError("Font size must be positive.");
  let sizes = stores.get(profile);
  if (!sizes) { sizes = new Map(); stores.set(profile, sizes); }
  let store = sizes.get(fontSize);
  if (!store) { store = createStore(profile, fontSize); sizes.set(fontSize, store); }
  return store;
};

/** Preload a display face before committing a font switch. Grid geometry stays fixed. */
export const loadCellFontMetrics = async (
  profile: CharDeskFontProfile,
  fontSize = DEFAULT_CELL_UI_METRICS.fontSize
): Promise<CharDeskCellMetrics> => {
  const store = getStore(profile, fontSize);
  await store.load();
  return store.getSnapshot().metrics;
};

const noSubscribe = () => () => {};
export const useCellFontMetrics = (
  profile = CHARDESK_SYSTEM_FONT_PROFILE,
  fontSize = DEFAULT_CELL_UI_METRICS.fontSize,
  explicit?: CharDeskCellMetrics
): FontMetricsSnapshot => {
  const store = useMemo(() => {
    if (!explicit) return getStore(profile, fontSize);
    const snapshot: FontMetricsSnapshot = { metrics: explicit, source: "explicit", ready: true };
    return { subscribe: noSubscribe, getSnapshot: () => snapshot };
  }, [profile, fontSize, explicit]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};
