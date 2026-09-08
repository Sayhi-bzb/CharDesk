import { type CharDeskFontProfile } from "@chardesk/fonts";
import { loadCharDeskCanvasFonts } from "@chardesk/rendering/canvas";
import { displayFontOptions, type DisplayFont } from "./catalog";
import { DEFAULT_CANVAS_FONT_PROFILE } from "./canvas-profile";
import { loadDisplayFont } from "./loading";

export const CANVAS_FONT_STORAGE_KEY = "chardesk-canvas-font-v1";
export type CanvasFontStorage = Pick<Storage, "getItem" | "setItem">;
type CanvasFontSnapshot = Readonly<{
  font: DisplayFont;
  requestedFont: DisplayFont;
  status: "idle" | "loading" | "error";
  profile: CharDeskFontProfile;
}>;

export const isDisplayFont = (value: unknown): value is DisplayFont =>
  typeof value === "string" && Object.hasOwn(displayFontOptions, value);

const migrateStoredDisplayFont = (value: unknown): unknown =>
  value === "ark-mono" ? "fusion-mono" : value;

const loadCanvasFont = async (font: DisplayFont) => {
  const option = displayFontOptions[font];
  await loadDisplayFont(option);
  const profile = option.profile;
  await loadCharDeskCanvasFonts(["AgWi09", "世界，。", "─", "│", "╭", "█"], { fontProfile: profile });
};

/** Host-owned preference; no document/history state and no renderer-side globals. */
export function createCanvasFontRuntime({
  storage = false,
  load = loadCanvasFont,
}: {
  storage?: CanvasFontStorage | false;
  load?: (font: DisplayFont) => Promise<void>;
} = {}) {
  let snapshot: CanvasFontSnapshot = {
    font: "maple", requestedFont: "maple", status: "idle", profile: DEFAULT_CANVAS_FONT_PROFILE,
  };
  let request = 0;
  let disposed = false;
  let started = false;
  const listeners = new Set<() => void>();
  const publish = (next: CanvasFontSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const select = async (font: DisplayFont) => {
    if (disposed || !isDisplayFont(font)) return;
    const version = ++request;
    publish({ ...snapshot, requestedFont: font, status: "loading" });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        load(font),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Font loading timed out.")), 20_000);
        }),
      ]);
      if (disposed || version !== request) return;
      publish({ font, requestedFont: font, status: "idle", profile: displayFontOptions[font].profile });
      try { if (storage) storage.setItem(CANVAS_FONT_STORAGE_KEY, font); } catch { /* Session-only preference. */ }
    } catch {
      if (!disposed && version === request) publish({ ...snapshot, status: "error" });
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select,
    start: () => {
      if (started || disposed) return;
      started = true;
      let font: DisplayFont = "maple";
      try {
        const stored = migrateStoredDisplayFont(
          storage && storage.getItem(CANVAS_FONT_STORAGE_KEY),
        );
        if (isDisplayFont(stored)) font = stored;
      } catch { /* Default remains available without storage. */ }
      void select(font);
    },
    dispose: () => { disposed = true; request += 1; listeners.clear(); },
  };
}

export type CanvasFontRuntime = ReturnType<typeof createCanvasFontRuntime>;
