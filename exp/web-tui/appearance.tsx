import { Moon } from "pixelarticons/react/Moon";
import { Square } from "pixelarticons/react/Square";
import { SquareSharp } from "pixelarticons/react/SquareSharp";
import { Sun } from "pixelarticons/react/Sun";
import { TextStartT } from "pixelarticons/react/TextStartT";
import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { CellSurface, DEFAULT_CELL_UI_METRICS, loadCellFontMetrics, useCellCssTheme, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { resolveCellUiTheme, type CellBorderShape } from "@chardesk/cell-ui";
import {
  galleryFontOptions,
  nextGalleryFont,
  type GalleryFont,
  type GalleryFontOption,
} from "./font-options";

const defaultTheme = resolveCellUiTheme(undefined);
type GalleryFontStatus = "idle" | "loading" | "error";
const stylesheetLoads = new Map<GalleryFont, Promise<void>>();

const loadFontStylesheet = (option: GalleryFontOption): Promise<void> => {
  if (!option.stylesheet) return Promise.resolve();
  const pending = stylesheetLoads.get(option.id);
  if (pending) return pending;
  const previous = document.querySelector<HTMLLinkElement>(
    `link[data-gallery-font-source="${option.id}"]`
  );
  if (previous?.dataset.galleryFontLoad === "ready") return Promise.resolve();
  previous?.remove();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = option.stylesheet;
  link.crossOrigin = "anonymous";
  link.dataset.galleryFontSource = option.id;
  link.dataset.galleryFontLoad = "loading";
  const load = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => {
      link.dataset.galleryFontLoad = "ready";
      resolve();
    }, { once: true });
    link.addEventListener("error", () => {
      link.remove();
      reject(new Error(`Unable to load ${option.label}.`));
    }, { once: true });
    document.head.append(link);
  }).catch((error: unknown) => {
    stylesheetLoads.delete(option.id);
    throw error;
  });
  stylesheetLoads.set(option.id, load);
  return load;
};

const resetFontStylesheet = (option: GalleryFontOption) => {
  stylesheetLoads.delete(option.id);
  document.querySelector<HTMLLinkElement>(
    `link[data-gallery-font-source="${option.id}"]`
  )?.remove();
};

const AppearanceContext = createContext({
  mode: "light" as "light" | "dark",
  font: "maple" as GalleryFont,
  pendingFont: null as GalleryFont | null,
  fontStatus: "idle" as GalleryFontStatus,
  fontMessage: "",
  fontProfile: MAPLE_FONT_PROFILE,
  theme: defaultTheme,
  palette: { color: defaultTheme.foreground, background: defaultTheme.background },
  toggleTheme: () => {},
  toggleBorder: () => {},
  toggleFont: () => {},
});
const themePreferenceKey = "chardesk-web-tui-theme";
const readPreference = (): "light" | "dark" | null => {
  try {
    const value = localStorage.getItem(themePreferenceKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
};
const query = window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (callback: () => void) => {
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
export function GalleryAppearance({ children }: { children: ReactNode }) {
  const dark = useSyncExternalStore(subscribe, () => query.matches, () => false);
  const [preference, setPreference] = useState(readPreference);
  const [font, setFont] = useState<GalleryFont>("maple");
  const [pendingFont, setPendingFont] = useState<GalleryFont | null>(null);
  const [fontStatus, setFontStatus] = useState<GalleryFontStatus>("idle");
  const [fontMessage, setFontMessage] = useState("");
  const [borderShape, setBorderShape] = useState<CellBorderShape>("square");
  const toggleBorder = () => setBorderShape((shape) => shape === "square" ? "rounded" : "square");
  const mode = preference ?? (dark ? "dark" : "light");
  const rootRef = useRef<HTMLDivElement>(null);
  const fontRequestRef = useRef(0);
  useLayoutEffect(() => () => { fontRequestRef.current += 1; }, []);
  const toggleTheme = () => {
    const next = mode === "light" ? "dark" : "light";
    setPreference(next);
    try { localStorage.setItem(themePreferenceKey, next); } catch { /* In-memory switching remains available. */ }
  };
  const toggleFont = async () => {
    if (fontStatus === "loading") return;
    const request = ++fontRequestRef.current;
    const target = fontStatus === "error" && pendingFont
      ? pendingFont
      : nextGalleryFont(font);
    const option = galleryFontOptions[target];
    setPendingFont(target);
    setFontStatus("loading");
    setFontMessage(`Loading ${option.label}.`);
    try {
      await loadFontStylesheet(option);
      if (option.fontSpec) {
        const samples = option.loadSamples ?? ["AgWi09"];
        const loaded = await Promise.all(samples.map((sample) =>
          document.fonts.load(option.fontSpec!, sample)));
        if (loaded.some((faces) => faces.length === 0)) {
          throw new Error(`Unable to load ${option.label}.`);
        }
      }
      await loadCellFontMetrics(option.profile);
      if (request !== fontRequestRef.current) return;
      setFont(target);
      setPendingFont(null);
      setFontStatus("idle");
      setFontMessage(`Display font: ${option.label}.`);
    } catch {
      if (request !== fontRequestRef.current) return;
      resetFontStylesheet(option);
      setFontStatus("error");
      setFontMessage(`${option.label} is unavailable. Display remains ${galleryFontOptions[font].label}.`);
    }
  };
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
  return <AppearanceContext.Provider value={{ ...appearance, theme: { ...appearance.theme, borderShape }, mode, font, pendingFont, fontStatus, fontMessage, fontProfile, toggleTheme, toggleBorder, toggleFont }}>
    <div ref={rootRef} className="gallery-page" data-gallery-theme={mode} data-gallery-font={font} data-gallery-font-status={fontStatus} style={style}>{children}</div>
  </AppearanceContext.Provider>;
}
// Shares the resolved CSS theme and appearance controls across the Gallery.
// eslint-disable-next-line react-refresh/only-export-components
export const useGalleryAppearance = () => useContext(AppearanceContext);
export function GalleryIconButton({ label, tooltip = label, children, className = "", ...props }: Readonly<{
  label: string;
  tooltip?: string;
  children: ReactNode;
}> & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">) {
  return <button {...props} className={`gallery-icon-button ${className}`.trim()} type="button" aria-label={label}>
    {children}
    <span className="gallery-control-tooltip" role="tooltip">{tooltip}</span>
  </button>;
}
export function GalleryThemeToggle() {
  const { mode, toggleTheme } = useGalleryAppearance();
  const label = mode === "light" ? "Dark" : "Light";
  return <GalleryIconButton label={label} onClick={toggleTheme}>
    {mode === "light"
      ? <Moon aria-hidden="true" data-gallery-icon="moon" />
      : <Sun aria-hidden="true" data-gallery-icon="sun" />}
  </GalleryIconButton>;
}
export function GalleryBorderToggle() {
  const { theme, toggleBorder } = useGalleryAppearance();
  const rounded = theme.borderShape === "rounded";
  const label = rounded ? "Square" : "Rounded";
  return <GalleryIconButton label={label} aria-pressed={rounded} onClick={toggleBorder}>
    {rounded
      ? <SquareSharp aria-hidden="true" data-gallery-icon="square" />
      : <Square aria-hidden="true" data-gallery-icon="rounded" />}
  </GalleryIconButton>;
}
export function GalleryFontToggle() {
  const { font, pendingFont, fontStatus, fontMessage, toggleFont } = useGalleryAppearance();
  const target = fontStatus === "error" && pendingFont ? pendingFont : nextGalleryFont(font);
  const targetLabel = galleryFontOptions[target].label;
  const label = fontStatus === "loading"
    ? `Loading ${targetLabel}`
    : fontStatus === "error"
      ? `Retry ${targetLabel}`
      : `Use ${targetLabel}`;
  const tooltip = fontStatus === "error"
    ? `${targetLabel} unavailable · Display: ${galleryFontOptions[font].label}`
    : `Display: ${galleryFontOptions[font].label} · Next: ${targetLabel}`;
  return <>
    <GalleryIconButton
      label={label}
      tooltip={tooltip}
      data-gallery-font-toggle
      aria-busy={fontStatus === "loading" || undefined}
      aria-disabled={fontStatus === "loading" || undefined}
      onClick={toggleFont}
    >
      <TextStartT aria-hidden="true" data-gallery-icon="font" />
    </GalleryIconButton>
    {fontMessage ? <span className="gallery-visually-hidden" role="status" aria-live="polite">{fontMessage}</span> : null}
  </>;
}
export function GallerySurface(props: CellSurfaceProps) {
  const { theme, palette, fontProfile } = useGalleryAppearance();
  return <CellSurface {...props} theme={theme} palette={palette} fontProfile={fontProfile} glyphOverflow="visible" />;
}
