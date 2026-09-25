import { StrictMode, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  componentDocumentBySlug,
  componentNavigationDocuments,
  type ComponentDocument,
} from "./component-catalog";
import { guideContent, type GuideContent } from "./docs-content";
import { FixturePage } from "./fixtures";
import { GalleryAppearance, GalleryFontSelect, GalleryThemeToggle } from "./appearance";
import { GitHubStars } from "./github-stars";
import { InstallationCellPage } from "./installation-cell-page";
import { CellDocumentPage } from "./cell-document-page";
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

function useRevealCurrentLink(currentKey: string) {
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const revealActive = () => {
      if (getComputedStyle(nav).overflowY !== "auto" || nav.scrollHeight <= nav.clientHeight) return;
      const active = nav.querySelector<HTMLAnchorElement>("a[aria-current]");
      if (!active) return;
      const navBounds = nav.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      const visibleTop = Math.max(navBounds.top, 0);
      const visibleBottom = Math.min(navBounds.bottom, window.innerHeight);
      if (visibleBottom <= visibleTop) return;
      if (activeBounds.top < visibleTop) nav.scrollTop += activeBounds.top - visibleTop;
      else if (activeBounds.bottom > visibleBottom) nav.scrollTop += activeBounds.bottom - visibleBottom;
    };
    revealActive();
    window.addEventListener("resize", revealActive);
    return () => window.removeEventListener("resize", revealActive);
  }, [currentKey]);
  return navRef;
}

export function GalleryNavigation({ activeRoute }: Readonly<{ activeRoute: string }>) {
  const navRef = useRevealCurrentLink(activeRoute);
  return (
    <nav ref={navRef} className="gallery-nav" aria-label="Cell UI">
      <div className="gallery-nav__group" role="group" aria-labelledby="gallery-nav-sections">
        <span className="gallery-nav__title" id="gallery-nav-sections">Sections</span>
        <ul>{guideContent.map((guide) => (
          <li key={guide.slug}><a href={`#/guides/${guide.slug}`} aria-current={activeRoute === `/guides/${guide.slug}` ? "page" : undefined}>{guide.title}</a></li>
        ))}</ul>
      </div>
      <div className="gallery-nav__group" role="group" aria-labelledby="gallery-nav-components">
        <span className="gallery-nav__title" id="gallery-nav-components">Components</span>
        <ul>
          {componentNavigationDocuments.map((document) => (
            <li key={document.slug}>
              <a
                href={`#/components/${document.slug}`}
                aria-current={activeRoute === `/components/${document.slug}` ? "page" : undefined}
              >
                {document.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function OnThisPage({ route, sections, activeSection }: Readonly<{ route: string; sections: readonly Readonly<{ id: string; label: string; tocLabel?: string }>[]; activeSection: string | null }>) {
  const tocRef = useRevealCurrentLink(`${route}?section=${activeSection ?? ""}`);
  return (
    <nav ref={tocRef} className="gallery-toc" aria-label="On This Page">
      <span className="gallery-toc__title">On This Page</span>
      <ul>{sections.map(({ id, label, tocLabel }) => (
        <li key={id}><a href={`#${route}?section=${id}`} aria-label={label} title={label} aria-current={activeSection === id ? "location" : undefined}>{tocLabel ?? label}</a></li>
      ))}</ul>
    </nav>
  );
}

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
      <header className="gallery-header">
        <div className="gallery-shell gallery-header__inner">
          <a className="gallery-brand" href={defaultHref}>CharDesk / Cell UI</a>
          <div className="gallery-appearance-controls"><GitHubStars /><GalleryFontSelect /><GalleryThemeToggle /></div>
        </div>
      </header>
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
