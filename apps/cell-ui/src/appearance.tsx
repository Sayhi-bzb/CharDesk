import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { loadBrowserFont, resetBrowserFont } from "@chardesk/fonts/browser";
import { CLASSIC_CELL_FEEDBACK, resolveCellFeedback, type CellFeedbackConfig, type CellUiRecipe } from "@chardesk/cell-ui";
import { CellSurface, DEFAULT_CELL_UI_METRICS, loadCellFontMetrics, useCellCssTheme, useCellSelectState, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { resolveCellUiTheme } from "@chardesk/cell-ui";
import {
  galleryFontOptions,
  type GalleryFont,
} from "./font-options";
import { useDocumentScene } from "./document-scene";

const defaultTheme = resolveCellUiTheme(undefined);
type GalleryFontStatus = "idle" | "loading" | "error";
type GalleryFontState = Readonly<{
  font: GalleryFont;
  pendingFont: GalleryFont | null;
  errorFont: GalleryFont | null;
  status: GalleryFontStatus;
  message: string;
}>;
const galleryFontLabels: Record<GalleryFont, string> = {
  maple: "Maple",
  "fusion-mono": "Fusion",
  "xiaolai-mono": "Xiaolai",
};

const AppearanceContext = createContext({
  feedback: CLASSIC_CELL_FEEDBACK,
  mode: "light" as "light" | "dark",
  font: "maple" as GalleryFont,
  pendingFont: null as GalleryFont | null,
  errorFont: null as GalleryFont | null,
  fontStatus: "idle" as GalleryFontStatus,
  fontMessage: "",
  fontProfile: MAPLE_FONT_PROFILE,
  theme: defaultTheme,
  palette: { color: defaultTheme.foreground, background: defaultTheme.background },
  recipe: {} as CellUiRecipe,
  toggleTheme: () => {},
  selectFont: (font: GalleryFont) => { void font; },
});
const themePreferenceKey = "chardesk-cell-ui-theme";
const fontPreferenceKey = "chardesk-cell-ui-font";
const defaultGalleryFont: GalleryFont = "fusion-mono";
const readPreference = (): "light" | "dark" | null => {
  try {
    const value = localStorage.getItem(themePreferenceKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
};
const readFontPreference = (): GalleryFont => {
  try {
    const value = localStorage.getItem(fontPreferenceKey);
    return value && Object.prototype.hasOwnProperty.call(galleryFontOptions, value)
      ? value as GalleryFont
      : defaultGalleryFont;
  } catch {
    return defaultGalleryFont;
  }
};
const writeFontPreference = (font: GalleryFont) => {
  try { localStorage.setItem(fontPreferenceKey, font); } catch { /* In-memory switching remains available. */ }
};
const initialFontState = (): GalleryFontState => {
  const preferredFont = readFontPreference();
  return preferredFont === "maple"
    ? { font: "maple", pendingFont: null, errorFont: null, status: "idle", message: "" }
    : {
        font: "maple",
        pendingFont: preferredFont,
        errorFont: null,
        status: "loading",
        message: `Loading ${galleryFontLabels[preferredFont]}.`,
      };
};
const query = window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (callback: () => void) => {
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
export function GalleryAppearance({ children, feedback }: { children: ReactNode; feedback?: Partial<CellFeedbackConfig> }) {
  const dark = useSyncExternalStore(subscribe, () => query.matches, () => false);
  const [preference, setPreference] = useState(readPreference);
  const [fontState, setFontState] = useState(initialFontState);
  const { font, pendingFont, errorFont, status: fontStatus, message: fontMessage } = fontState;
  const mode = preference ?? (dark ? "dark" : "light");
  const rootRef = useRef<HTMLDivElement>(null);
  const fontRequestRef = useRef(0);
  const toggleTheme = () => {
    const next = mode === "light" ? "dark" : "light";
    setPreference(next);
    try { localStorage.setItem(themePreferenceKey, next); } catch { /* In-memory switching remains available. */ }
  };
  const selectFont = (target: GalleryFont) => {
    setFontState((current) => current.status === "loading" ? current : {
      font: current.font,
      pendingFont: target,
      errorFont: null,
      status: "loading",
      message: `Loading ${galleryFontLabels[target]}.`,
    });
  };
  useEffect(() => {
    if (fontState.status !== "loading" || !fontState.pendingFont) return;
    const target = fontState.pendingFont;
    const option = galleryFontOptions[target];
    const request = ++fontRequestRef.current;
    void (async () => {
      try {
        await loadBrowserFont(option);
        await loadCellFontMetrics(option.profile);
        if (request !== fontRequestRef.current) return;
        writeFontPreference(target);
        setFontState({
          font: target,
          pendingFont: null,
          errorFont: null,
          status: "idle",
          message: `Display font: ${galleryFontLabels[target]}.`,
        });
      } catch {
        if (request !== fontRequestRef.current) return;
        resetBrowserFont(option);
        setFontState((current) => ({
          font: current.font,
          pendingFont: null,
          errorFont: target,
          status: "error",
          message: `${galleryFontLabels[target]} is unavailable. Display remains ${galleryFontLabels[current.font]}.`,
        }));
      }
    })();
    return () => { fontRequestRef.current += 1; };
  }, [fontState.pendingFont, fontState.status]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.galleryTheme;
    const previousFont = root.dataset.galleryFont;
    const previousFontStatus = root.dataset.galleryFontStatus;
    root.dataset.galleryTheme = mode;
    root.dataset.galleryFont = font;
    root.dataset.galleryFontStatus = fontStatus;
    return () => {
      if (previousTheme === undefined) delete root.dataset.galleryTheme;
      else root.dataset.galleryTheme = previousTheme;
      if (previousFont === undefined) delete root.dataset.galleryFont;
      else root.dataset.galleryFont = previousFont;
      if (previousFontStatus === undefined) delete root.dataset.galleryFontStatus;
      else root.dataset.galleryFontStatus = previousFontStatus;
    };
  }, [font, fontStatus, mode]);
  const appearance = useCellCssTheme(rootRef, mode);
  const fontProfile = galleryFontOptions[font].profile;
  const style = {
    fontFamily: fontProfile.families.text,
    colorScheme: mode,
    "--gallery-font-size": `${DEFAULT_CELL_UI_METRICS.fontSize}px`,
  } as CSSProperties;
  return <AppearanceContext.Provider value={{ ...appearance, feedback: resolveCellFeedback(feedback), mode, font, pendingFont, errorFont, fontStatus, fontMessage, fontProfile, toggleTheme, selectFont }}>
    <div ref={rootRef} className="gallery-page" data-gallery-theme={mode} data-gallery-font={font} data-gallery-font-status={fontStatus} style={style}>{children}</div>
  </AppearanceContext.Provider>;
}
// Shares the resolved CSS theme and appearance controls across the Gallery.
// eslint-disable-next-line react-refresh/only-export-components -- This hook reads the same live context as GallerySurface.
export const useGalleryAppearance = () => useContext(AppearanceContext);
const galleryFontItems = (Object.keys(galleryFontOptions) as GalleryFont[]).map((font) => ({
  id: `gallery-font-option-${font}`,
  label: galleryFontLabels[font],
  font,
}));
const fontItemId = (font: GalleryFont) => `gallery-font-option-${font}`;

export function useGalleryFontControl() {
  const { font, pendingFont, errorFont, fontStatus, fontMessage, selectFont } = useGalleryAppearance();
  const [open, setOpen] = useState(false);
  const select = useCellSelectState("gallery-font", galleryFontItems, {
    selectedId: fontItemId(font),
    open,
    onOpenChange: setOpen,
    onSelectionChange: (itemId) => {
      const item = galleryFontItems.find(({ id }) => id === itemId);
      if (item) void selectFont(item.font);
    },
  });
  const target = pendingFont ?? errorFont ?? font;
  const shortLabel = galleryFontLabels[target];
  const triggerText = fontStatus === "loading"
    ? `…${shortLabel}`
    : fontStatus === "error"
      ? `!${shortLabel}`
      : galleryFontLabels[font];
  const triggerLabel = fontStatus === "loading"
    ? `Loading ${galleryFontLabels[target]}. Current font: ${galleryFontLabels[font]}`
    : fontStatus === "error"
      ? `${galleryFontLabels[target]} unavailable. Current font: ${galleryFontLabels[font]}`
      : `Font: ${galleryFontLabels[font]}`;
  const itemSemanticLabel = (itemId: string) => {
    const item = galleryFontItems.find(({ id }) => id === itemId);
    return fontStatus === "error" && errorFont === item?.font
      ? `${item.label} unavailable; retry`
      : item?.label ?? itemId;
  };
  return { select, open, triggerText, triggerLabel, fontStatus, fontMessage, itemSemanticLabel };
}
export function GallerySurface(props: CellSurfaceProps) {
  const { theme, palette, recipe, fontProfile, feedback } = useGalleryAppearance();
  const documentScene = useDocumentScene();
  const register = documentScene?.register;
  useLayoutEffect(() => {
    if (!register || !props.probeId) return;
    const id = props.probeId;
    register(id, {
      label: props.label ?? id,
      root: props.children,
      viewport: props.viewport,
      presentation: props.presentation ?? "rich",
      focusedId: props.focusedId ?? null,
      onCommand: props.onCommand,
      onHoverChange: props.onHoverChange,
    });
  }, [register, props.children, props.focusedId, props.label, props.onCommand, props.onHoverChange, props.presentation,
    props.probeId, props.viewport]);
  useLayoutEffect(() => {
    if (!register || !props.probeId) return;
    const id = props.probeId;
    return () => register(id, null);
  }, [register, props.probeId]);
  if (documentScene) return null;
  return <CellSurface
    {...props}
    metrics={props.metrics ?? DEFAULT_CELL_UI_METRICS}
    theme={theme}
    recipe={props.recipe ?? recipe}
    feedback={feedback}
    palette={palette}
    fontProfile={fontProfile}
  />;
}
