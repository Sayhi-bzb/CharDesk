import { Moon, Square, SquareRoundCorner, Sun } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { CHARDESK_FONT_PROFILE } from "@chardesk/fonts";
import { CellSurface, useCellCssTheme, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { resolveCellUiTheme, type CellBorderShape } from "@chardesk/cell-ui";

const defaultTheme = resolveCellUiTheme(undefined);
const AppearanceContext = createContext({
  mode: "light" as "light" | "dark",
  theme: defaultTheme,
  palette: { color: defaultTheme.foreground, background: defaultTheme.background },
  toggleTheme: () => {},
  toggleBorder: () => {},
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
  const [borderShape, setBorderShape] = useState<CellBorderShape>("square");
  const toggleBorder = () => setBorderShape((shape) => shape === "square" ? "rounded" : "square");
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
  return <AppearanceContext.Provider value={{ ...appearance, theme: { ...appearance.theme, borderShape }, mode, toggleTheme, toggleBorder }}>
    <div ref={rootRef} className="gallery-page" data-gallery-theme={mode} style={style}>{children}</div>
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
    {mode === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
  </GalleryIconButton>;
}
export function GalleryBorderToggle() {
  const { theme, toggleBorder } = useGalleryAppearance();
  const rounded = theme.borderShape === "rounded";
  const label = rounded ? "Square" : "Rounded";
  return <GalleryIconButton label={label} aria-pressed={rounded} onClick={toggleBorder}>
    {rounded ? <Square aria-hidden="true" /> : <SquareRoundCorner aria-hidden="true" />}
  </GalleryIconButton>;
}
export function GallerySurface(props: CellSurfaceProps) {
  const { theme, palette } = useGalleryAppearance();
  return <CellSurface {...props} theme={theme} palette={palette} />;
}
