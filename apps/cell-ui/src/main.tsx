import { StrictMode, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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

export function DocumentationShell({ document, guide, section }: Readonly<{ document?: ComponentDocument; guide?: GuideContent; section: string | null }>) {
  const title = guide?.title ?? document?.title ?? "Cell UI";
  const route = guide ? `/guides/${guide.slug}` : `/components/${document!.slug}`;
  const sections = guide ? guide.sections.map(({ id, title: label, tocLabel }) => ({ id, label, tocLabel })) : documentationSections;
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
        <GalleryNavigation activeRoute={route} />
        <OnThisPage route={route} sections={sections} activeSection={section} />
        {guide ? guide.slug === "installation"
          ? <InstallationCellPage guide={guide} key={guide.slug} />
          : <CellDocumentPage guide={guide} key={guide.slug} />
          : <CellDocumentPage document={document!} key={document!.slug} />}
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <main className="not-found">
      <h1>Page not found</h1>
      <p><a href={defaultHref}>Open Introduction</a></p>
    </main>
  );
}

export function CellUiApp(): ReactNode {
  const route = useRoute();
  useEffect(() => {
    if (!window.location.hash) window.location.replace(defaultHref);
  }, []);
  const fixture = route.match(/^\/__fixtures\/([^/]+)$/);
  if (fixture) return <FixturePage slug={fixture[1]!} />;
  const [path, query = ""] = route.split("?", 2);
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
