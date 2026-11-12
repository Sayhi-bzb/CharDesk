import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Box, Button, Link, Root, Text, Tooltip, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, DEFAULT_CELL_UI_METRICS } from "@chardesk/cell-ui/browser";
import { DocumentationSurface, useDocumentationAppearance, useDocumentationFontControl } from "./appearance";
import { renderGallerySelect } from "./control-recipes";
import { galleryHeaderPixelIcons } from "./header-icons";
import { useDocumentationLink } from "./links";

const narrowQuery = typeof window === "undefined" ? null : window.matchMedia("(max-width: 720px)");
const subscribeNarrow = (callback: () => void) => {
  narrowQuery?.addEventListener("change", callback);
  return () => narrowQuery?.removeEventListener("change", callback);
};

export function DocumentationHeader({ brandHref = "#/guides/introduction", brandLabel = "Cell UI", repository, extraControls, onExtraCommand }: Readonly<{
  brandHref?: string | null; brandLabel?: string;
  repository?: { url: string; label: string; count: string };
  extraControls?: ReactNode; onExtraCommand?: (command: WidgetCommand) => void;
}>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const openLink = useDocumentationLink();
  const [width, setWidth] = useState(1);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const narrow = useSyncExternalStore(subscribeNarrow, () => narrowQuery?.matches ?? false, () => false);
  const { mode, toggleTheme, theme } = useDocumentationAppearance();
  const font = useDocumentationFontControl();
  const stars = repository ?? { url: "https://github.com/Sayhi-bzb/CharDesk", label: "CharDesk on GitHub", count: "" };
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
    onExtraCommand?.(command);
    if (command.type === "activate" && command.targetId === "gallery-header-theme") toggleTheme();
    if (command.type === "open-link") openLink(command.href, command.target);
  };
  const brand = <Box id="gallery-header-brand-links" style={{ direction: "row", gap: 0 }}>
    <Link id="gallery-header-brand" href="https://chardesk.com/" textStyle={{ color: theme.foreground, bold: true }}>CharDesk</Link>
    <Text id="gallery-header-brand-separator" textStyle={{ bold: true }}> / </Text>
    {brandHref
      ? <Link id="gallery-header-cell-ui" href={brandHref} textStyle={{ color: theme.foreground, bold: true }}>{brandLabel}</Link>
      : <Text id="gallery-header-cell-ui" textStyle={{ bold: true }}>{brandLabel}</Text>}
  </Box>;
  const controls = <Box id="gallery-header-controls" style={{ direction: "row", width: narrow ? "100%" : undefined, gap: 1 }}>
    <Link id="gallery-header-github" href={stars.url} target="_blank" label={stars.label}
      textStyle={theme.secondaryStyle}>{`   ${stars.count}`}</Link>
    {narrow ? <Box style={{ flexGrow: 1 }} /> : null}
    {extraControls}
    {renderGallerySelect({ label: "Font", select: font.select, focusedId: effectiveFocusedId,
      width: 12, open: font.open, showLabel: false, disabled: font.fontStatus === "loading",
      triggerText: font.triggerText, triggerLabel: font.triggerLabel, contentLabel: "Fonts",
      itemSemanticLabel: font.itemSemanticLabel })}
    <Button id="gallery-header-theme" label={themeLabel} variant="ghost" style={{ width: 4 }}>
      <Box id="gallery-header-theme-icon" style={{ width: 2, height: 1 }} />
    </Button>
  </Box>;

  return <header className="gallery-header">
    <div className="gallery-shell gallery-header__inner" ref={hostRef}>
      <DocumentationSurface className="gallery-header__surface" label={`${brandLabel} header`} probeId="gallery-header"
        svgIcons={galleryHeaderPixelIcons(mode)}
        viewport={{ width, height: rows }}
        overlayViewport={{ width, height: rows + (font.open ? 3 : 1) }}
        focusedId={effectiveFocusedId} onCommand={onCommand}>
        <Root id="gallery-header-root" style={{ direction: narrow ? "column" : "row", width: "100%", height: rows }}>
          {brand}
          {narrow ? null : <Box style={{ flexGrow: 1 }} />}
          {controls}
          <Tooltip id="gallery-header-theme-tooltip" targetId="gallery-header-theme" text={themeLabel} />
        </Root>
      </DocumentationSurface>
    </div>
    {font.fontMessage ? <span className="gallery-visually-hidden" role="status" aria-live="polite">{font.fontMessage}</span> : null}
    <span className="gallery-visually-hidden" role="status" aria-live="polite">{stars.label}</span>
  </header>;
}
