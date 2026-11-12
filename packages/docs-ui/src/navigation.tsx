import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Box, Link, Root, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { useDocumentationAppearance } from "./appearance";
import { DocumentationArticleSurface as CellArticleSurface } from "./article";
import { useDocumentationLink } from "./links";

export type NavigationItem = Readonly<{ id: string; label: string; href: string; tocLabel?: string }>;
export type NavigationSection = Readonly<{ id: string; label: string; tocLabel?: string }>;
const noAnchors: readonly string[] = [];
const navMedia = "(max-width: 720px)";
const tocMedia = "(max-width: 1050px)";
const useNarrow = (query: string) => {
  const media = useMemo(() => typeof window === "undefined" ? null : window.matchMedia(query), [query]);
  return useSyncExternalStore(callback => {
    media?.addEventListener("change", callback);
    return () => media?.removeEventListener("change", callback);
  }, () => media?.matches ?? false, () => false);
};
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
      const snapshot = surface ? readCellSurfaceProbe(surface) : null;
      const cells = snapshot?.cells.filter(({ ownerId }) => ownerId === active?.dataset.cellSemanticId) ?? [];
      if (!surface || !snapshot?.presentation || !cells.length) return false;
      if (getComputedStyle(nav).overflowY !== "auto" || nav.scrollHeight <= nav.clientHeight) return true;
      const metrics = snapshot.presentation.metrics;
      const surfaceTop = surface.getBoundingClientRect().top;
      const top = surfaceTop + (Math.min(...cells.map(({ y }) => y)) + CELL_SURFACE_GUARD_CELLS) * metrics.cellHeight;
      const bottom = surfaceTop + (Math.max(...cells.map(({ y }) => y)) + CELL_SURFACE_GUARD_CELLS + 1) * metrics.cellHeight;
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

function navigationLinks({ probeId, items, current, horizontal, isToc, theme }: Readonly<{
  probeId: string;
  items: readonly NavigationItem[];
  current: string;
  horizontal: boolean;
  isToc: boolean;
  theme: ReturnType<typeof useDocumentationAppearance>["theme"];
}>) {
  return <Box style={{ width: "100%", direction: horizontal ? "row" : "column", wrap: horizontal, gap: horizontal ? 2 : 0 }}>
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
    </Box>;
}

function NavigationGroup({ title, probeId, items, current, horizontal, isToc = false }: Readonly<{
  title: string;
  probeId: string;
  items: readonly NavigationItem[];
  current: string;
  horizontal: boolean;
  isToc?: boolean;
}>) {
  const { theme } = useDocumentationAppearance();
  const openLink = useDocumentationLink();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const content = useMemo(() => <Root><Box id={`${probeId}-content`} style={{ width: "100%", gap: 1 }}>
    <Text textStyle={{ bold: true }}>{title}</Text>
    {navigationLinks({ probeId, items, current, horizontal, isToc, theme })}
  </Box></Root>, [title, probeId, items, current, horizontal, isToc, theme]);
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "open-link") openLink(command.href, command.target);
  };
  return <CellArticleSurface label={title} probeId={probeId} content={content}
    anchorIds={noAnchors} focusedId={focusedId} onCommand={onCommand} />;
}


export type NavigationGroupData = Readonly<{ id: string; title: string; items: readonly NavigationItem[]; current: string }>;
export function DocumentationNavigation({ route, pageTitle, sections, activeSection, requestedSection, groups, sectionHref, label = "Documentation" }: Readonly<{
  route: string; pageTitle: string; sections: readonly NavigationSection[];
  activeSection: string | null; requestedSection: string | null;
  groups: readonly NavigationGroupData[]; sectionHref: (id: string) => string; label?: string;
}>) {
  const narrow = useNarrow(navMedia);
  const navRef = useRevealCurrentCellLink(route);
  if (narrow) return <MobileDocsNavigation key={`${route}?${requestedSection ?? ""}`}
    pageTitle={pageTitle} pageSections={sections} activeSection={activeSection}
    groups={[...groups].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)))} sectionHref={sectionHref} label={label} />;
  return <nav ref={navRef} className="gallery-nav" aria-label={label}>
    {groups.map(group => <div key={group.id} role="group" aria-label={group.title}>
      <NavigationGroup title={group.title} probeId={`gallery-nav-${group.id}`} items={group.items} current={group.current} horizontal={false} />
    </div>)}
  </nav>;
}

function MobileDocsNavigation({ pageTitle, pageSections, activeSection, groups, sectionHref, label }: Readonly<{
  pageTitle: string;
  pageSections: readonly NavigationSection[];
  activeSection: string | null;
  groups: readonly NavigationGroupData[];
  sectionHref: (id: string) => string;
  label: string;
}>) {
  const { theme } = useDocumentationAppearance();
  const openLink = useDocumentationLink();
  const [open, setOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const restoreTriggerFocus = useRef(false);
  const category = groups[0]?.title ?? label;
  const visibleTitle = pageTitle.length > 12 ? `${pageTitle.slice(0, 11)}…` : pageTitle;
  const tocItems = useMemo(() => pageSections.map(({ id, label, tocLabel }): NavigationItem => ({
    id, label, tocLabel: truncate(tocLabel ?? label), href: sectionHref(id),
  })), [sectionHref, pageSections]);
  useLayoutEffect(() => {
    if (!open && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      document.querySelector<HTMLElement>('[data-cell-semantic-id="gallery-mobile-nav-trigger"]')?.focus();
    }
  }, [open]);
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "set-expanded" && command.targetId === "gallery-mobile-nav-item") setOpen(command.expanded);
    if (command.type === "open-link") {
      setOpen(false);
      openLink(command.href, command.target);
    }
  };
  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    restoreTriggerFocus.current = true;
    setOpen(false);
  };
  const content = <Root><Box id="gallery-mobile-nav-content" style={{ width: "100%" }}>
    <Accordion style={{ width: "100%" }}>
    <AccordionItem id="gallery-mobile-nav-item" expanded={open} style={{ width: "100%" }}>
      <AccordionTrigger id="gallery-mobile-nav-trigger" label={`Browse documentation: ${category} / ${pageTitle}`}>
        <Text>{`${category} / ${visibleTitle}`}</Text>
      </AccordionTrigger>
      <AccordionContent id="gallery-mobile-nav-panel">
        <Box style={{ width: "100%", gap: 1, paddingLeft: 2 }}>
          {groups.map((group) => <Box key={group.id} style={{ width: "100%", gap: 1 }}>
            <Text textStyle={{ bold: true }}>{group.title}</Text>
            {navigationLinks({ probeId: `gallery-mobile-${group.id}`, items: group.items,
              current: group.current, horizontal: true, isToc: false, theme })}
          </Box>)}
          {tocItems.length ? <Box style={{ width: "100%", gap: 1 }}>
            <Text textStyle={{ bold: true }}>On This Page</Text>
            {navigationLinks({ probeId: "gallery-mobile-toc", items: tocItems,
              current: activeSection ?? "", horizontal: true, isToc: true, theme })}
          </Box> : null}
        </Box>
      </AccordionContent>
    </AccordionItem>
    </Accordion>
  </Box></Root>;
  return <nav className="gallery-nav gallery-nav--mobile" aria-label={label} onKeyDownCapture={onKeyDownCapture}>
    <CellArticleSurface label="Documentation navigation" probeId="gallery-mobile-nav"
      content={content} anchorIds={noAnchors} focusedId={focusedId} onCommand={onCommand} />
  </nav>;
}


export function DocumentationContents({ route, sections: pageSections, activeSection, sectionHref, label = "On This Page" }: Readonly<{
  route: string;
  sections: readonly NavigationSection[];
  activeSection: string | null;
  sectionHref: (id: string) => string;
  label?: string;
}>) {
  const narrow = useNarrow(tocMedia);
  const mobile = useNarrow(navMedia);
  const navRef = useRevealCurrentCellLink(`${route}?section=${activeSection ?? ""}`);
  const items = useMemo(() => pageSections.map(({ id, label, tocLabel }): NavigationItem => ({
    id, label, href: sectionHref(id), tocLabel: truncate(tocLabel ?? label),
  })), [sectionHref, pageSections]);
  if (mobile) return null;
  return <nav ref={navRef} className="gallery-toc" aria-label={label}>
    <NavigationGroup title={label} probeId="gallery-toc" items={items}
      current={activeSection ?? ""} horizontal={narrow} isToc />
  </nav>;
}

export function useVisibleDocumentationSection(route: string, section: string | null, sectionIds: string) {
  const [visibleSection, setVisibleSection] = useState<string | null>(section);
  useEffect(() => { setVisibleSection(section); }, [route, section]);
  useEffect(() => {
    let frame = 0;
    let active = true;
    const update = () => {
      frame = 0;
      const threshold = window.matchMedia("(max-width: 720px)").matches
        ? 24 : (document.querySelector(".gallery-header")?.getBoundingClientRect().height ?? 64) + 8;
      const ids = sectionIds.split("\0").filter(Boolean);
      const requested = section ? document.getElementById(section)?.getBoundingClientRect() : null;
      const requestedVisible = !!requested && requested.top < window.innerHeight - 16
        && requested.bottom >= threshold;
      const atBottom = window.scrollY > 0
        && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const current = requestedVisible ? section : atBottom ? ids.at(-1) ?? null : ids.filter((id) =>
        (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= threshold).at(-1) ?? null;
      setVisibleSection(current);
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const page = document.querySelector(".docs-page");
    const observer = page && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (page) observer?.observe(page);
    void document.fonts.ready.then(schedule);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [route, section, sectionIds]);
  return visibleSection;
}
