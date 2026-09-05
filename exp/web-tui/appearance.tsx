import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { CHARDESK_FONT_PROFILE } from "@chardesk/fonts";
import { CellSurface, useCellCssTheme, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { resolveCellUiTheme } from "@chardesk/cell-ui";

const defaultTheme = resolveCellUiTheme(undefined);
const AppearanceContext = createContext({
  mode: "light" as "light" | "dark",
  theme: defaultTheme,
  palette: { color: defaultTheme.foreground, background: defaultTheme.background },
  toggleTheme: () => {},
});
const preferenceKey = "chardesk-web-tui-theme";
const readPreference = (): "light" | "dark" | null => {
  try {
    const value = localStorage.getItem(preferenceKey);
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
  const mode = preference ?? (dark ? "dark" : "light");
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleTheme = () => {
    const next = mode === "light" ? "dark" : "light";
    setPreference(next);
    try { localStorage.setItem(preferenceKey, next); } catch { /* In-memory switching remains available. */ }
  };
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.galleryTheme;
    root.dataset.galleryTheme = mode;
    return () => {
      if (previous === undefined) delete root.dataset.galleryTheme;
      else root.dataset.galleryTheme = previous;
    };
  }, [mode]);
  const appearance = useCellCssTheme(rootRef, mode);
  const style = { fontFamily: CHARDESK_FONT_PROFILE.families.text, colorScheme: mode } as CSSProperties;
  return <AppearanceContext.Provider value={{ ...appearance, mode, toggleTheme }}>
    <div ref={rootRef} className="gallery-page" data-gallery-theme={mode} style={style}>{children}</div>
  </AppearanceContext.Provider>;
}
// Shares the resolved CSS theme and appearance controls across the Gallery.
// eslint-disable-next-line react-refresh/only-export-components
export const useGalleryAppearance = () => useContext(AppearanceContext);
export function GalleryThemeToggle() {
  const { mode, toggleTheme } = useGalleryAppearance();
  const label = mode === "light" ? "Switch to dark theme" : "Switch to light theme";
  return <button className="gallery-theme-toggle" type="button" aria-label={label} onClick={toggleTheme}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {mode === "light"
        ? <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />
        : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>}
    </svg>
    <span className="gallery-theme-tooltip" role="tooltip">{label}</span>
  </button>;
}
export function GallerySurface(props: CellSurfaceProps) {
  const { theme, palette } = useGalleryAppearance();
  return <CellSurface {...props} theme={theme} palette={palette} />;
}
