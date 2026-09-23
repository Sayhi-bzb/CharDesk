import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { createRoot } from "react-dom/client";
import { Check } from "pixelarticons/react/Check";
import { Close } from "pixelarticons/react/Close";
import { Copy } from "pixelarticons/react/Copy";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import {
  componentDocumentBySlug,
  componentNavigationDocuments,
  defaultComponentSlug,
  sourceLinksForComponent,
  type ComponentDocument,
} from "./component-catalog";
import { FixturePage } from "./fixtures";
import { GalleryAppearance, GalleryFontSelect, GalleryIconButton, GalleryThemeToggle } from "./appearance";
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
const defaultComponentRoute = `/components/${defaultComponentSlug}`;
const defaultComponentHref = `#${defaultComponentRoute}`;
const readRoute = () => window.location.hash.slice(1) || defaultComponentRoute;
const useRoute = () => useSyncExternalStore(subscribeToHash, readRoute, () => defaultComponentRoute);
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

export function CodeBlock({ children }: Readonly<{ children: string }>) {
  return (
    <div className="docs-code">
      <CopyButton readText={() => children} />
      <pre><code>{children}</code></pre>
    </div>
  );
}

const installationCommands = {
  pnpm: "pnpm dlx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui",
  npm: "npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui",
  yarn: "yarn dlx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui",
  bun: "bunx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui",
} as const;
type PackageManager = keyof typeof installationCommands;
const packageManagers = Object.keys(installationCommands) as PackageManager[];
const sourceInstallationGuide = "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/README.md#source-installation";
const manualInstallationGuide = "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/README.md#manual-source-installation";
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
const publicUsage = (usage: string) => usage
  .replaceAll('"@chardesk/cell-ui/browser"', '"@/lib/cell-ui/browser"')
  .replaceAll('"@chardesk/cell-ui"', '"@/lib/cell-ui"');

export function GalleryNavigation({ activeSlug }: Readonly<{ activeSlug: string }>) {
  return (
    <nav className="gallery-nav" aria-label="Cell UI">
      <div className="gallery-nav__group" role="group" aria-labelledby="gallery-nav-components">
        <span className="gallery-nav__title" id="gallery-nav-components">Components</span>
        <ul>
          {componentNavigationDocuments.map((document) => (
            <li key={document.slug}>
              <a
                href={`#/components/${document.slug}`}
                aria-current={activeSlug === document.slug ? "page" : undefined}
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
  const [method, setMethod] = useState<"command" | "manual">("command");
  const [manager, setManager] = useState<PackageManager>("npm");
  return (
    <section className="docs-section" aria-labelledby="installation">
      <h2 id="installation">Installation</h2>
      <div className="docs-tabs" role="tablist" aria-label="Installation method" onKeyDown={handleTabKeyDown}>
        <button id="installation-command-tab" type="button" role="tab" aria-selected={method === "command"} aria-controls="installation-command-panel" tabIndex={method === "command" ? 0 : -1} onClick={() => setMethod("command")}>Command</button>
        <button id="installation-manual-tab" type="button" role="tab" aria-selected={method === "manual"} aria-controls="installation-manual-panel" tabIndex={method === "manual" ? 0 : -1} onClick={() => setMethod("manual")}>Manual</button>
      </div>
      <div id="installation-command-panel" role="tabpanel" aria-labelledby="installation-command-tab" hidden={method !== "command"}>
        <p>Install the editable Cell UI source in a React project with a shadcn <code>components.json</code> and a <code>lib</code> alias. This installs the full library, not just this component. See the <a href={sourceInstallationGuide}>source installation guide</a> for the setup contract.</p>
        <div className="docs-tabs" role="tablist" aria-label="Package manager" onKeyDown={handleTabKeyDown}>
          {packageManagers.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={manager === name} aria-controls="installation-command" tabIndex={manager === name ? 0 : -1} onClick={() => setManager(name)}>{name}</button>
          ))}
        </div>
        <div id="installation-command" role="tabpanel" aria-label={`${manager} installation command`}>
          <CodeBlock>{installationCommands[manager]}</CodeBlock>
        </div>
      </div>
      <div id="installation-manual-panel" role="tabpanel" aria-labelledby="installation-manual-tab" hidden={method !== "manual"}>
        <p>Copy the Registry source into your configured <code>lib</code> directory and install its declared dependencies. Follow the <a href={manualInstallationGuide}>manual source installation guide</a> for the authoritative file mapping.</p>
      </div>
    </section>
  );
}

export function OnThisPage({ slug, activeSection }: Readonly<{ slug: string; activeSection: DocumentationSection | null }>) {
  return (
    <nav className="gallery-toc" aria-label="On This Page">
      <span className="gallery-toc__title">On This Page</span>
      <ul>{documentationSections.map(({ id, label }) => (
        <li key={id}><a href={`#/components/${slug}?section=${id}`} aria-current={activeSection === id ? "location" : undefined}>{label}</a></li>
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

export function DocumentationShell({ document, section }: Readonly<{ document: ComponentDocument; section: DocumentationSection | null }>) {
  useEffect(() => {
    window.document.title = `${document.title} – CharDesk Cell UI`;
    if (section) window.document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [document.slug, document.title, section]);
  return (
    <>
      <header className="gallery-header">
        <a className="gallery-brand" href={defaultComponentHref}>CharDesk / Cell UI</a>
        <div className="gallery-appearance-controls"><GalleryFontSelect /><GalleryThemeToggle /></div>
      </header>
      <div className="gallery-layout">
        <GalleryNavigation activeSlug={document.slug} />
        <OnThisPage slug={document.slug} activeSection={section} />
        <ComponentPage document={document} key={document.slug} />
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <main className="not-found">
      <h1>Component not found</h1>
      <p><a href={defaultComponentHref}>Open Button</a></p>
    </main>
  );
}

export function CellUiApp(): ReactNode {
  const route = useRoute();
  useEffect(() => {
    if (!window.location.hash) window.location.replace(defaultComponentHref);
  }, []);
  const fixture = route.match(/^\/__fixtures\/([^/]+)$/);
  if (fixture) return <FixturePage slug={fixture[1]!} />;
  const [path, query = ""] = route.split("?", 2);
  const component = path?.match(/^\/components\/([^/]+)$/);
  const document = component ? componentDocumentBySlug.get(component[1]!) : undefined;
  const requestedSection = new URLSearchParams(query).get("section");
  const section = isDocumentationSection(requestedSection) ? requestedSection : null;
  return document ? <DocumentationShell document={document} section={section} /> : <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><CellUiApp /></GalleryAppearance></StrictMode>,
);
