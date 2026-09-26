import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Box, Markdown, Root, type WidgetCommand } from "@chardesk/cell-ui";
import {
  componentDocumentBySlug,
  type ComponentDocument,
} from "./component-catalog";
import { guideContent, type GuideContent } from "./docs-content";
import { FixturePage } from "./fixtures";
import { GalleryAppearance } from "./appearance";
import { GalleryHeader } from "./gallery-header";
import { InstallationCellPage } from "./installation-cell-page";
import { CellDocumentPage } from "./cell-document-page";
import { GalleryNavigation, OnThisPage } from "./cell-navigation";
import { CellArticleSurface } from "./cell-article-surface";
import "./styles.css";
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-maple/fonts.css";

const subscribeToHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
const defaultRoute = "/guides/introduction";
const defaultHref = `#${defaultRoute}`;
const readRoute = () => window.location.hash.slice(1) || defaultRoute;
const useRoute = () => useSyncExternalStore(subscribeToHash, readRoute, () => defaultRoute);
const documentationSections = [
  { id: "installation", label: "Installation" },
  { id: "usage", label: "Usage" },
  { id: "source", label: "View source" },
  { id: "api", label: "API" },
] as const;
type DocumentationSection = typeof documentationSections[number]["id"];
const isDocumentationSection = (value: string | null): value is DocumentationSection =>
  documentationSections.some((section) => section.id === value);

function useVisibleSection(route: string, section: string | null, sectionIds: string) {
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

export function DocumentationShell({ document, guide, section }: Readonly<{ document?: ComponentDocument; guide?: GuideContent; section: string | null }>) {
  const title = guide?.title ?? document?.title ?? "Cell UI";
  const route = guide ? `/guides/${guide.slug}` : `/components/${document!.slug}`;
  const sections = guide ? guide.sections.map(({ id, title: label, tocLabel }) => ({ id, label, tocLabel })) : documentationSections;
  const visibleSection = useVisibleSection(route, section, sections.map(({ id }) => id).join("\0"));
  useEffect(() => {
    window.document.title = `${title} – CharDesk Cell UI`;
    if (!section) {
      window.scrollTo(0, 0);
      return;
    }
    let frame: number | undefined;
    let cancelled = false;
    const scroll = () => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        window.document.getElementById(section)?.scrollIntoView();
      });
    };
    const afterLoad = () => {
      if (window.document.documentElement.dataset.galleryFontStatus === "loading") return;
      void window.document.fonts.ready.then(scroll);
    };
    const fontObserver = new MutationObserver(afterLoad);
    fontObserver.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["data-gallery-font-status"],
    });
    if (window.document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      cancelled = true;
      fontObserver.disconnect();
      window.removeEventListener("load", afterLoad);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [route, title, section]);
  return (
    <>
      <GalleryHeader />
      <div className="gallery-shell gallery-layout">
        <GalleryNavigation activeRoute={route} pageTitle={title} pageSections={sections}
          activeSection={visibleSection} requestedSection={section} />
        <OnThisPage route={route} sections={sections} activeSection={visibleSection} />
        {guide ? guide.slug === "installation"
          ? <InstallationCellPage guide={guide} key={guide.slug} />
          : <CellDocumentPage guide={guide} key={guide.slug} />
          : <CellDocumentPage document={document!} key={document!.slug} />}
      </div>
    </>
  );
}

export function NotFound() {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useEffect(() => { window.document.title = "Page not found – CharDesk Cell UI"; }, []);
  const onCommand = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "open-link") window.location.assign(command.href);
  };
  return (
    <>
      <GalleryHeader />
      <main className="not-found cell-article-page gallery-shell">
        <CellArticleSurface label="Page not found" probeId="gallery-not-found" anchorIds={[]}
          focusedId={focusedId} onCommand={onCommand}
          content={<Root><Box id="gallery-not-found-content" style={{ width: "100%", gap: 1 }}>
            <Markdown source={`# Page not found\n\n[Open Introduction](${defaultHref})`} />
          </Box></Root>} />
      </main>
    </>
  );
}

export function CellUiApp(): ReactNode {
  const route = useRoute();
  const legacyHostRoute = route.split("?", 1)[0] === "/guides/host-overlays";
  useEffect(() => {
    if (!window.location.hash) window.location.replace(defaultHref);
  }, []);
  useEffect(() => {
    if (legacyHostRoute) {
      window.location.replace("#/guides/integration?section=overlays");
    }
  }, [legacyHostRoute]);
  const resolvedRoute = legacyHostRoute
    ? "/guides/integration?section=overlays" : route;
  const fixture = resolvedRoute.match(/^\/__fixtures\/([^/]+)$/);
  if (fixture) return <FixturePage slug={fixture[1]!} />;
  const [path, query = ""] = resolvedRoute.split("?", 2);
  const component = path?.match(/^\/components\/([^/]+)$/);
  const document = component ? componentDocumentBySlug.get(component[1]!) : undefined;
  const guideMatch = path?.match(/^\/guides\/([^/]+)$/);
  const guide = guideMatch ? guideContent.find((item) => item.slug === guideMatch[1]) : undefined;
  const requestedSection = new URLSearchParams(query).get("section");
  const section = guide ? guide.sections.some(({ id }) => id === requestedSection) ? requestedSection : null
    : isDocumentationSection(requestedSection) ? requestedSection : null;
  return document || guide ? <DocumentationShell document={document} guide={guide} section={section} /> : <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><CellUiApp /></GalleryAppearance></StrictMode>,
);
