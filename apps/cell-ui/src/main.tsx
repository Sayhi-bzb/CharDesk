import { StrictMode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { createRoot } from "react-dom/client";
import { Check } from "pixelarticons/react/Check";
import { Close } from "pixelarticons/react/Close";
import { Copy } from "pixelarticons/react/Copy";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import {
  componentDocumentBySlug,
  componentNavigationDocuments,
  sourceLinksForComponent,
  type ComponentDocument,
} from "./component-catalog";
import { guideContent, installationCommands, publicUsage, type GuideContent } from "./docs-content";
import { FixturePage } from "./fixtures";
import { GalleryAppearance, GalleryFontSelect, GalleryIconButton, GalleryThemeToggle } from "./appearance";
import { GitHubStars } from "./github-stars";
import { NotesIntroductionDemo, ProgressIntroductionDemo, SettingsIntroductionDemo } from "./introduction-demos";
import highlightedCode from "virtual:gallery-code-tokens";
import "./styles.css";
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-maple/fonts.css";

type CopyState = "idle" | "pending" | "success" | "error";
type GalleryIcon = ComponentType<SVGProps<SVGSVGElement>>;
const copyPresentation: Record<CopyState, Readonly<{ label: string; icon: GalleryIcon; iconName: string }>> = {
  idle: { label: "Copy", icon: Copy, iconName: "copy" },
  pending: { label: "Copy", icon: Copy, iconName: "copy" },
  success: { label: "Copied", icon: Check, iconName: "check" },
  error: { label: "Copy failed", icon: Close, iconName: "error" },
};

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

export function CopyButton({ readText }: Readonly<{ readText: () => string | Promise<string> }>) {
  const [state, setState] = useState<CopyState>("idle");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (pending.current) return;
    pending.current = true;
    clearTimeout(timer.current);
    setState("pending");
    try {
      await navigator.clipboard.writeText(await readText());
      setState("success");
    } catch {
      setState("error");
    } finally {
      pending.current = false;
      timer.current = setTimeout(() => setState("idle"), 2000);
    }
  };
  const presentation = copyPresentation[state];
  const Icon = presentation.icon;
  return (
    <GalleryIconButton
      label={presentation.label}
      tooltip="Copy"
      aria-live="polite"
      data-copy-state={state}
      disabled={state === "pending"}
      onClick={copy}
    >
      <Icon aria-hidden="true" data-gallery-icon={presentation.iconName} />
    </GalleryIconButton>
  );
}

export function CodeBlock({ children, language = "tsx" }: Readonly<{ children: string; language?: "tsx" | "text" }>) {
  const tokens = language === "tsx" ? highlightedCode[children] : undefined;
  return (
    <div className="docs-code">
      <CopyButton readText={() => children} />
      <pre><code data-code-language={language}>{tokens
        ? tokens.map((token, index) => <span key={index} className={token.bold ? "docs-code__emphasis" : undefined} style={{ color: token.color }}>{token.content}</span>)
        : children}</code></pre>
    </div>
  );
}

type PackageManager = keyof typeof installationCommands;
const packageManagers = Object.keys(installationCommands) as PackageManager[];
const registrySetupGuide = "#/guides/installation?section=configure";
const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
};
export function GalleryNavigation({ activeRoute }: Readonly<{ activeRoute: string }>) {
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const revealActive = () => {
      if (getComputedStyle(nav).overflowY !== "auto" || nav.scrollHeight <= nav.clientHeight) return;
      const active = nav.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
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
  }, [activeRoute]);
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

export function Preview({ document }: Readonly<{ document: ComponentDocument }>) {
  const { Demo } = document;
  const readSnapshot = () => {
    const surface = window.document.querySelector(`[data-cell-probe="${document.probeId}"]`);
    const snapshot = surface ? readCellSurfaceProbe(surface) : null;
    if (!snapshot) throw new Error("Snapshot is unavailable.");
    return formatCellProbe(snapshot, { header: true });
  };
  return (
    <section className="docs-section" aria-labelledby="preview-title">
      <div className="docs-section__heading">
        <h2 id="preview-title">Preview</h2>
        <CopyButton readText={readSnapshot} />
      </div>
      <div className="docs-preview"><Demo /></div>
    </section>
  );
}

export function Installation() {
  const [manager, setManager] = useState<PackageManager>("npm");
  return (
    <section className="docs-section" aria-labelledby="installation">
      <h2 id="installation">Installation</h2>
      <div className="docs-tabs" role="tablist" aria-label="Package manager" onKeyDown={handleTabKeyDown}>
        {packageManagers.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={manager === name} aria-controls="installation-command" tabIndex={manager === name ? 0 : -1} onClick={() => setManager(name)}>{name}</button>
        ))}
      </div>
      <div id="installation-command" role="tabpanel" aria-label={`${manager} installation command`}>
        <CodeBlock language="text">{installationCommands[manager]}</CodeBlock>
      </div>
      <p><a href={registrySetupGuide}>Configure the registry</a></p>
    </section>
  );
}

export function OnThisPage({ route, sections, activeSection }: Readonly<{ route: string; sections: readonly Readonly<{ id: string; label: string }>[]; activeSection: string | null }>) {
  return (
    <nav className="gallery-toc" aria-label="On This Page">
      <span className="gallery-toc__title">On This Page</span>
      <ul>{sections.map(({ id, label }) => (
        <li key={id}><a href={`#${route}?section=${id}`} aria-current={activeSection === id ? "location" : undefined}>{label}</a></li>
      ))}</ul>
    </nav>
  );
}

export function ComponentPage({ document }: Readonly<{ document: ComponentDocument }>) {
  return (
    <main className="docs-page">
      <header className="docs-page__header">
        <h1>{document.title}</h1>
        <p>{document.description}</p>
      </header>
      <Preview document={document} />
      <Installation />
      <section className="docs-section" aria-labelledby="usage">
        <h2 id="usage">Usage</h2>
        <CodeBlock>{publicUsage(document.usage)}</CodeBlock>
      </section>
      <section className="docs-section" aria-labelledby="source">
        <h2 id="source">View source</h2>
        <p>Start with the component definition, then open its supporting implementation as needed.</p>
        <ul className="docs-source-links">
          {sourceLinksForComponent(document.slug).map(({ label, href }) =>
            <li key={href}><a href={href}>{label}</a></li>
          )}
        </ul>
      </section>
      <section className="docs-section" aria-labelledby="api">
        <h2 id="api">API</h2>
        <div className="docs-table-wrap">
          <table>
            <thead><tr><th>Prop</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              {document.api.map((row) => (
                <tr key={row.name}>
                  <td><code>{row.name}</code></td>
                  <td><code>{row.type}</code></td>
                  <td>{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const guideDemos = {
  settings: SettingsIntroductionDemo,
  progress: ProgressIntroductionDemo,
  notes: NotesIntroductionDemo,
} satisfies Record<NonNullable<GuideContent["sections"][number]["demo"]>, ComponentType>;

export function GuidePage({ guide }: Readonly<{ guide: GuideContent }>) {
  return <main className="docs-page">
    <header className="docs-page__header"><h1>{guide.title}</h1><p>{guide.description}</p></header>
    {guide.sections.map((section) => {
      const Demo = section.demo ? guideDemos[section.demo] : null;
      return <section className="docs-section" aria-labelledby={section.id} key={section.id}>
        <h2 id={section.id}>{section.title}</h2><p>{section.body}</p>
        {Demo ? <div className="docs-preview"><Demo /></div> : null}
        {section.code ? <CodeBlock language={guide.slug === "installation" ? "text" : "tsx"}>{section.code}</CodeBlock> : null}
        {section.link ? <p><a href={section.link.href}>{section.link.label}</a></p> : null}
      </section>;
    })}
  </main>;
}

export function DocumentationShell({ document, guide, section }: Readonly<{ document?: ComponentDocument; guide?: GuideContent; section: string | null }>) {
  const title = guide?.title ?? document?.title ?? "Cell UI";
  const route = guide ? `/guides/${guide.slug}` : `/components/${document!.slug}`;
  const sections = guide ? guide.sections.map(({ id, title: label }) => ({ id, label })) : documentationSections;
  useEffect(() => {
    window.document.title = `${title} – CharDesk Cell UI`;
    if (section) window.document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [route, title, section]);
  return (
    <>
      <header className="gallery-header">
        <a className="gallery-brand" href={defaultHref}>CharDesk / Cell UI</a>
        <div className="gallery-appearance-controls"><GitHubStars /><GalleryFontSelect /><GalleryThemeToggle /></div>
      </header>
      <div className="gallery-layout">
        <GalleryNavigation activeRoute={route} />
        <OnThisPage route={route} sections={sections} activeSection={section} />
        {guide ? <GuidePage guide={guide} key={guide.slug} /> : <ComponentPage document={document!} key={document!.slug} />}
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
