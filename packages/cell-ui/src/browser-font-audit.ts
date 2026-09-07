import { CHARDESK_SYSTEM_FONT_PROFILE } from "@chardesk/fonts";
import {
  auditCharDeskCanvasFont, getCharDeskCanvasFont, resolveCharDeskCanvasFontFace,
  resolveCharDeskCanvasGlyphSource,
  type CharDeskCanvasMetrics, type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import { resolveCharDeskFontRoute } from "@chardesk/rendering";
import { useMemo, useSyncExternalStore } from "react";
import type { CellProbePresentation } from "./probe.js";

type CellFontAuditSnapshot = NonNullable<CellProbePresentation["fontAudit"]>;

const samples = Array.from(new Set([
  ...Array.from({ length: 95 }, (_,i) => String.fromCharCode(32 + i)),
  ..."世界，。│█▀▄─┌└→",
])).filter((text) => resolveCharDeskCanvasGlyphSource(text) === "font")
  .flatMap((grapheme) => [{ grapheme, bold: false }, { grapheme, bold: true }]);
const loading: CellFontAuditSnapshot = { status: "loading" };
const inactive = { getSnapshot: () => loading, subscribe: () => () => {} };
const stores = new WeakMap<CharDeskFontProfile, Map<string, ReturnType<typeof createStore>>>();

function createStore(profile: CharDeskFontProfile, metrics: CharDeskCanvasMetrics) {
  let snapshot = loading;
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: CellFontAuditSnapshot) => {
    if (JSON.stringify(snapshot) === JSON.stringify(next)) return;
    snapshot = next;
    for (const notify of listeners) notify();
  };
  const refresh = () => {
    if (pending) return;
    publish(loading);
    pending = Promise.resolve().then(async () => {
      if (!document.fonts) {
        publish({ status: "unavailable", reason: "font-load-failed" });
        return;
      }
      const groups = new Map<string, Set<string>>();
      for (const sample of samples) {
        const route = resolveCharDeskFontRoute(sample.grapheme);
        const face = resolveCharDeskCanvasFontFace({ ...sample, route, italic: false, fontProfile: profile });
        const font = getCharDeskCanvasFont(metrics, 1, { bold: sample.bold,
          fontFamily: face.family, fontSizeScale: face.fontSizeScale, weightPolicy: face.weightPolicy });
        const group = groups.get(font) ?? new Set<string>();
        group.add(sample.grapheme);
        groups.set(font, group);
      }
      try {
        await Promise.all([...groups].map(([font, texts]) => document.fonts.load(font, [...texts].join(""))));
      } catch {
        publish({ status: "unavailable", reason: "font-load-failed" });
        return;
      }
      try {
        const context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const report = auditCharDeskCanvasFont(context, profile, metrics, samples);
        publish(report.samples.some((sample) => sample.status === "unavailable")
          ? { status: "unavailable", reason: "measurement-unavailable", report }
          : { status: "ready", report });
      } catch {
        publish({ status: "unavailable", reason: "measurement-unavailable" });
      }
    }).catch(() => {
      publish({ status: "unavailable", reason: "measurement-unavailable" });
    }).finally(() => { pending = undefined; });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        document.fonts?.addEventListener("loadingdone", refresh);
        // Cached stores may have missed font events while unsubscribed.
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) document.fonts?.removeEventListener("loadingdone", refresh);
      };
    },
  };
}

export const useCellFontAudit = (
  enabled: boolean, profile = CHARDESK_SYSTEM_FONT_PROFILE, metrics: CharDeskCanvasMetrics
): CellFontAuditSnapshot => {
  const key = JSON.stringify(metrics);
  const store = useMemo(() => {
    if (!enabled) return inactive;
    let profiles = stores.get(profile);
    if (!profiles) { profiles = new Map(); stores.set(profile, profiles); }
    let entry = profiles.get(key);
    if (!entry) { entry = createStore(profile, JSON.parse(key) as CharDeskCanvasMetrics); profiles.set(key, entry); }
    return entry;
  }, [enabled, profile, key]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
};
