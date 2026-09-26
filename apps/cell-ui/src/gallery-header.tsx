import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Box, Button, Link, Root, Text, Tooltip, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, DEFAULT_CELL_UI_METRICS } from "@chardesk/cell-ui/browser";
import { GallerySurface, useGalleryAppearance, useGalleryFontControl } from "./appearance";
import { renderGallerySelect } from "./gallery-component-recipes";
import { repositoryUrl, useGitHubStars } from "./github-stars";

const narrowQuery = window.matchMedia("(max-width: 720px)");
const subscribeNarrow = (callback: () => void) => {
  narrowQuery.addEventListener("change", callback);
  return () => narrowQuery.removeEventListener("change", callback);
};

export function GalleryHeader({ brandHref = "#/guides/introduction" }: Readonly<{ brandHref?: string | null }>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const narrow = useSyncExternalStore(subscribeNarrow, () => narrowQuery.matches, () => false);
  const { mode, toggleTheme, theme } = useGalleryAppearance();
  const font = useGalleryFontControl();
  const stars = useGitHubStars();
  const rows = narrow ? 2 : 1;
  const themeLabel = mode === "light" ? "Dark" : "Light";
  const effectiveFocusedId = font.open ? font.select.focusedId
    : focusedId?.startsWith("gallery-font-option-") ? font.select.triggerId : focusedId;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      if (host.clientWidth > 0) setWidth(Math.max(1,
        Math.floor(host.clientWidth / DEFAULT_CELL_UI_METRICS.cellWidth) - 2 * CELL_SURFACE_GUARD_CELLS));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    font.select.dispatch(command);
    if (command.type === "activate" && command.targetId === "gallery-header-theme") toggleTheme();
    if (command.type === "open-link") {
      if (command.target === "_blank") window.open(command.href, "_blank", "noopener,noreferrer");
      else window.location.assign(command.href);
    }
  };
  const brand = brandHref
    ? <Link id="gallery-header-brand" href={brandHref} textStyle={{ bold: true }}>CharDesk / Cell UI</Link>
    : <Text id="gallery-header-brand" textStyle={{ bold: true }}>CharDesk / Cell UI</Text>;
  const controls = <Box id="gallery-header-controls" style={{ direction: "row", width: narrow ? "100%" : undefined, gap: 1 }}>
    <Link id="gallery-header-github" href={repositoryUrl} target="_blank" label={stars.label}
      textStyle={theme.secondaryStyle}>{` ${stars.count}`}</Link>
    {narrow ? <Box style={{ flexGrow: 1 }} /> : null}
    {renderGallerySelect({ label: "Font", select: font.select, focusedId: effectiveFocusedId,
      width: 12, open: font.open, showLabel: false, disabled: font.fontStatus === "loading",
      triggerText: font.triggerText, triggerLabel: font.triggerLabel, contentLabel: "Fonts",
      itemSemanticLabel: font.itemSemanticLabel })}
    <Button id="gallery-header-theme" label={themeLabel} variant="ghost" style={{ width: 3 }}>
      <Text>{mode === "light" ? "" : ""}</Text>
    </Button>
  </Box>;

  return <header className="gallery-header">
    <div className="gallery-shell gallery-header__inner" ref={hostRef}>
      <GallerySurface className="gallery-header__surface" label="Cell UI header" probeId="gallery-header"
        viewport={{ width, height: rows }}
        overlayViewport={{ width, height: rows + (font.open ? 3 : 1) }}
        focusedId={effectiveFocusedId} onCommand={onCommand}>
        <Root id="gallery-header-root" style={{ direction: narrow ? "column" : "row", width: "100%", height: rows }}>
          {brand}
          {narrow ? null : <Box style={{ flexGrow: 1 }} />}
          {controls}
          <Tooltip id="gallery-header-theme-tooltip" targetId="gallery-header-theme" text={themeLabel} />
        </Root>
      </GallerySurface>
    </div>
    {font.fontMessage ? <span className="gallery-visually-hidden" role="status" aria-live="polite">{font.fontMessage}</span> : null}
    <span className="gallery-visually-hidden" role="status" aria-live="polite">{stars.label}</span>
  </header>;
}
