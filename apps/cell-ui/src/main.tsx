import { DocumentationLayout } from "@chardesk/docs-ui/layout";
import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Box, Markdown, Root, type WidgetCommand } from "@chardesk/cell-ui";
import {
  componentDocumentBySlug,
  type ComponentDocument,
} from "./component-catalog";
import { guideContent, type GuideContent } from "./docs-content";
import { primitiveDocumentBySlug, type PrimitiveDocument } from "./primitive-catalog";
import { FixturePage } from "./fixtures";
import { GalleryAppearance } from "./appearance";
import { GalleryHeader } from "./gallery-header";
import { InstallationCellPage } from "./installation-cell-page";
import { CellDocumentPage } from "./cell-document-page";
import { useVisibleDocumentationSection as useVisibleSection } from "@chardesk/docs-ui/navigation";
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

export function DocumentationShell({ document, primitive, guide, section }: Readonly<{ document?: ComponentDocument; primitive?: PrimitiveDocument; guide?: GuideContent; section: string | null }>) {
  const activeDocument = document ?? primitive;
  const title = guide?.title ?? activeDocument?.title ?? "Cell UI";
  const route = guide ? `/guides/${guide.slug}` : primitive ? `/primitives/${primitive.slug}` : `/components/${document!.slug}`;
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
      <DocumentationLayout>
        <GalleryNavigation activeRoute={route} pageTitle={title} pageSections={sections}
          activeSection={visibleSection} requestedSection={section} />
        <OnThisPage route={route} sections={sections} activeSection={visibleSection} />
        {guide ? guide.slug === "installation"
          ? <InstallationCellPage guide={guide} key={guide.slug} />
          : <CellDocumentPage guide={guide} key={guide.slug} />
          : <CellDocumentPage document={activeDocument!} key={activeDocument!.slug} />}
      </DocumentationLayout>
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
  const primitiveMatch = path?.match(/^\/primitives\/([^/]+)$/);
  const primitive = primitiveMatch ? primitiveDocumentBySlug.get(primitiveMatch[1]!) : undefined;
  const guideMatch = path?.match(/^\/guides\/([^/]+)$/);
  const guide = guideMatch ? guideContent.find((item) => item.slug === guideMatch[1]) : undefined;
  const requestedSection = new URLSearchParams(query).get("section");
  const section = guide ? guide.sections.some(({ id }) => id === requestedSection) ? requestedSection : null
    : isDocumentationSection(requestedSection) ? requestedSection : null;
  return document || primitive || guide ? <DocumentationShell document={document} primitive={primitive} guide={guide} section={section} /> : <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><CellUiApp /></GalleryAppearance></StrictMode>,
);
