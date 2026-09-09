import { Moon } from "pixelarticons/react/Moon";
import { Sun } from "pixelarticons/react/Sun";
import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { CLASSIC_CELL_FEEDBACK, resolveCellFeedback, type CellFeedbackConfig } from "@chardesk/cell-ui";
import { CellSurface, DEFAULT_CELL_UI_METRICS, loadCellFontMetrics, useCellCssTheme, useCellSelectState, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { Root, Select, SelectContent, SelectItem, SelectTrigger, Text, resolveCellUiTheme } from "@chardesk/cell-ui";
import {
  galleryFontOptions,
  type GalleryFont,
} from "./font-options";
import { loadDisplayFont, resetDisplayFontStylesheet } from "../../src/shared/fonts/loading";

const defaultTheme = resolveCellUiTheme(undefined);
type GalleryFontStatus = "idle" | "loading" | "error";
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
  fontStatus: "idle" as GalleryFontStatus,
  fontMessage: "",
  fontProfile: MAPLE_FONT_PROFILE,
  theme: defaultTheme,
  palette: { color: defaultTheme.foreground, background: defaultTheme.background },
  toggleTheme: () => {},
  selectFont: (font: GalleryFont) => { void font; },
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
export function GalleryAppearance({ children, feedback }: { children: ReactNode; feedback?: Partial<CellFeedbackConfig> }) {
  const dark = useSyncExternalStore(subscribe, () => query.matches, () => false);
  const [preference, setPreference] = useState(readPreference);
  const [font, setFont] = useState<GalleryFont>("maple");
  const [pendingFont, setPendingFont] = useState<GalleryFont | null>(null);
  const [fontStatus, setFontStatus] = useState<GalleryFontStatus>("idle");
  const [fontMessage, setFontMessage] = useState("");
  const mode = preference ?? (dark ? "dark" : "light");
  const rootRef = useRef<HTMLDivElement>(null);
  const fontRequestRef = useRef(0);
  useLayoutEffect(() => () => { fontRequestRef.current += 1; }, []);
  const toggleTheme = () => {
    const next = mode === "light" ? "dark" : "light";
    setPreference(next);
    try { localStorage.setItem(themePreferenceKey, next); } catch { /* In-memory switching remains available. */ }
  };
  const selectFont = async (target: GalleryFont) => {
    if (fontStatus === "loading") return;
    const request = ++fontRequestRef.current;
    const option = galleryFontOptions[target];
    setPendingFont(target);
    setFontStatus("loading");
    setFontMessage(`Loading ${galleryFontLabels[target]}.`);
    try {
      await loadDisplayFont(option);
      await loadCellFontMetrics(option.profile);
      if (request !== fontRequestRef.current) return;
      setFont(target);
      setPendingFont(null);
      setFontStatus("idle");
      setFontMessage(`Display font: ${galleryFontLabels[target]}.`);
    } catch {
      if (request !== fontRequestRef.current) return;
      resetDisplayFontStylesheet(option);
      setFontStatus("error");
      setFontMessage(`${galleryFontLabels[target]} is unavailable. Display remains ${galleryFontLabels[font]}.`);
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
  return <AppearanceContext.Provider value={{ ...appearance, feedback: resolveCellFeedback(feedback), mode, font, pendingFont, fontStatus, fontMessage, fontProfile, toggleTheme, selectFont }}>
    <div ref={rootRef} className="gallery-page" data-gallery-theme={mode} data-gallery-font={font} data-gallery-font-status={fontStatus} style={style}>{children}</div>
  </AppearanceContext.Provider>;
}
// Shares the resolved CSS theme and appearance controls across the Gallery.
const useGalleryAppearance = () => useContext(AppearanceContext);
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
const galleryFontItems = (Object.keys(galleryFontOptions) as GalleryFont[]).map((font) => ({
  id: `gallery-font-option-${font}`,
  label: galleryFontLabels[font],
  font,
}));
const fontItemId = (font: GalleryFont) => `gallery-font-option-${font}`;

export function GalleryFontSelect() {
  const { font, pendingFont, fontStatus, fontMessage, selectFont } = useGalleryAppearance();
  const select = useCellSelectState("gallery-font", galleryFontItems, {
    selectedId: fontItemId(font),
    onSelectionChange: (itemId) => {
      const item = galleryFontItems.find(({ id }) => id === itemId);
      if (item) void selectFont(item.font);
    },
  });
  const target = pendingFont ?? font;
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
  const open = select.open && fontStatus !== "loading";
  return <div className="gallery-font-select" data-state={fontStatus} data-open={open || undefined}>
    <GallerySurface
      className="gallery-font-select__surface"
      viewport={{ width: 12, height: 1 }}
      overlayViewport={{ width: 12, height: open ? 6 : 1 }}
      focusedId={select.focusedId}
      onCommand={select.dispatch}
      label="Font"
      probeId="gallery-font-select"
    >
      <Root id="gallery-font-root" style={{ direction: "row" }}>
        <Select id={select.id} label="Font" style={{ width: 12 }}>
          <SelectTrigger
            id={select.triggerId}
            label={triggerLabel}
            expanded={open}
            controlsId={open ? select.contentId : undefined}
            disabled={fontStatus === "loading"}
            style={{ width: 12 }}
          ><Text>{triggerText}</Text></SelectTrigger>
          {open ? (
            <SelectContent
              id={select.contentId}
              label="Fonts"
              scrollY={select.scrollY}
              style={{ width: 12 }}
            >
              {galleryFontItems.map((item, index) => (
                <SelectItem
                  id={item.id}
                  key={item.id}
                  label={fontStatus === "error" && pendingFont === item.font
                    ? `${item.label} unavailable; retry`
                    : item.label}
                  selected={select.selectedId === item.id}
                  positionInSet={index + 1}
                  setSize={galleryFontItems.length}
                ><Text>{item.label}</Text></SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>
      </Root>
    </GallerySurface>
    {fontMessage ? <span className="gallery-visually-hidden" role="status" aria-live="polite">{fontMessage}</span> : null}
  </div>;
}
export function GallerySurface(props: CellSurfaceProps) {
  const { theme, palette, fontProfile, feedback } = useGalleryAppearance();
  return <CellSurface {...props} theme={theme} feedback={feedback} palette={palette} fontProfile={fontProfile} glyphOverflow="visible" />;
}
