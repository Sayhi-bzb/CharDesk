import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, Link, Root, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { useGalleryAppearance } from "./appearance";
import { CellArticleSurface } from "./cell-article-surface";
import { componentNavigationDocuments } from "./component-catalog";
import { guideContent } from "./docs-content";

type NavigationItem = Readonly<{ id: string; label: string; href: string; tocLabel?: string }>;
const noAnchors: readonly string[] = [];
const navMedia = window.matchMedia("(max-width: 720px)");
const tocMedia = window.matchMedia("(max-width: 1050px)");
const subscribe = (query: MediaQueryList, callback: () => void) => {
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const useNarrow = (query: MediaQueryList) => useSyncExternalStore(
  (callback) => subscribe(query, callback), () => query.matches, () => false,
);
const truncate = (label: string) => label.length > 20 ? `${label.slice(0, 19)}…` : label;

function useRevealCurrentCellLink(currentKey: string) {
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frame = 0;
    const reveal = () => {
      const active = nav.querySelector<HTMLAnchorElement>('a[aria-current]');
      const surface = active?.closest<HTMLElement>("[data-cell-probe]");
      const canvas = surface?.querySelector("canvas");
      const snapshot = surface ? readCellSurfaceProbe(surface) : null;
      const cells = snapshot?.cells.filter(({ ownerId }) => ownerId === active?.dataset.cellSemanticId) ?? [];
      if (!canvas || !snapshot?.presentation || !cells.length) return false;
      if (getComputedStyle(nav).overflowY !== "auto" || nav.scrollHeight <= nav.clientHeight) return true;
      const metrics = snapshot.presentation.metrics;
      const canvasTop = canvas.getBoundingClientRect().top;
      const top = canvasTop + (Math.min(...cells.map(({ y }) => y)) + CELL_SURFACE_GUARD_CELLS) * metrics.cellHeight;
      const bottom = canvasTop + (Math.max(...cells.map(({ y }) => y)) + CELL_SURFACE_GUARD_CELLS + 1) * metrics.cellHeight;
      const bounds = nav.getBoundingClientRect();
      const visibleTop = Math.max(bounds.top, 0);
      const visibleBottom = Math.min(bounds.bottom, window.innerHeight);
      if (top < visibleTop) nav.scrollTop += top - visibleTop;
      else if (bottom > visibleBottom) nav.scrollTop += bottom - visibleBottom;
      return true;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (reveal()) observer.disconnect(); }); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ["data-semantic-revision"] });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, [currentKey]);
  return navRef;
}

function NavigationGroup({ title, probeId, items, current, horizontal }: Readonly<{
  title: string;
  probeId: string;
  items: readonly NavigationItem[];
  current: string;
  horizontal: boolean;
}>) {
  const { theme } = useGalleryAppearance();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const isToc = title === "On This Page";
  const content = useMemo(() => <Root><Box id={`${probeId}-content`} style={{ width: "100%", gap: 1 }}>
    <Text textStyle={{ bold: true }}>{title}</Text>
    <Box style={{ width: "100%", direction: horizontal ? "row" : "column", wrap: horizontal, gap: horizontal ? 2 : 0 }}>
      {items.map(({ id, label, href, tocLabel }) => {
        const active = current === id;
        return <Link key={id} id={`${probeId}-${id}`}
          href={href} label={label} current={active ? isToc ? "location" : "page" : undefined}
          style={{ maxWidth: "100%", ...(!isToc && !horizontal ? { width: "100%" as const } : {}) }}
          textStyle={active && !isToc ? theme.selectedStyle : {
            color: active ? theme.foreground : theme.secondaryStyle.color,
            bold: active,
          }}>
          {tocLabel ?? label}
        </Link>;
      })}
    </Box>
  </Box></Root>, [title, probeId, items, current, horizontal, isToc, theme.foreground,
    theme.secondaryStyle.color, theme.selectedStyle]);
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "open-link") window.location.assign(command.href);
  };
  return <CellArticleSurface label={title} probeId={probeId} content={content}
    anchorIds={noAnchors} focusedId={focusedId} onCommand={onCommand} />;
}

const sections = guideContent.map(({ slug, title }): NavigationItem => ({ id: slug, label: title, href: `#/guides/${slug}` }));
const components = componentNavigationDocuments.map(({ slug, title }): NavigationItem => ({ id: slug, label: title, href: `#/components/${slug}` }));

export function GalleryNavigation({ activeRoute }: Readonly<{ activeRoute: string }>) {
  const narrow = useNarrow(navMedia);
  const navRef = useRevealCurrentCellLink(activeRoute);
  const selected = activeRoute.split("/").at(-1) ?? "";
  return <nav ref={navRef} className="gallery-nav" aria-label="Cell UI">
    <div role="group" aria-label="Sections"><NavigationGroup title="Sections" probeId="gallery-nav-sections"
      items={sections} current={activeRoute.startsWith("/guides/") ? selected : ""} horizontal={narrow} /></div>
    <div role="group" aria-label="Components"><NavigationGroup title="Components" probeId="gallery-nav-components"
      items={components} current={activeRoute.startsWith("/components/") ? selected : ""} horizontal={narrow} /></div>
  </nav>;
}

export function OnThisPage({ route, sections: pageSections, activeSection }: Readonly<{
  route: string;
  sections: readonly Readonly<{ id: string; label: string; tocLabel?: string }>[];
  activeSection: string | null;
}>) {
  const narrow = useNarrow(tocMedia);
  const navRef = useRevealCurrentCellLink(`${route}?section=${activeSection ?? ""}`);
  const items = useMemo(() => pageSections.map(({ id, label, tocLabel }): NavigationItem => ({
    id, label, href: `#${route}?section=${id}`, tocLabel: truncate(tocLabel ?? label),
  })), [route, pageSections]);
  return <nav ref={navRef} className="gallery-toc" aria-label="On This Page">
    <NavigationGroup title="On This Page" probeId="gallery-toc" items={items}
      current={activeSection ?? ""} horizontal={narrow} />
  </nav>;
}
