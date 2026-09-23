import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from "react";
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

const installCommand = "npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui";
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

export function ComponentPage({ document }: Readonly<{ document: ComponentDocument }>) {
  return (
    <main className="docs-page">
      <header className="docs-page__header">
        <h1>{document.title}</h1>
        <p>{document.description}</p>
      </header>
      <Preview document={document} />
      <section className="docs-section" aria-labelledby="distribution-title">
        <h2 id="distribution-title">Distribution</h2>
        <p>
          Install the editable source in a React project with a shadcn <code>components.json</code> and
          a <code>lib</code> alias. See the <a href="https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/README.md#source-installation">source installation guide</a> for the setup contract.
        </p>
        <CodeBlock>{installCommand}</CodeBlock>
        <p>
          With <code>aliases.lib</code> set to <code>@/lib</code>, import Cell descriptors from
          <code> @/lib/cell-ui</code> and browser adapters from <code> @/lib/cell-ui/browser</code>.
        </p>
      </section>
      <section className="docs-section" aria-labelledby="usage-title">
        <h2 id="usage-title">Usage</h2>
        <CodeBlock>{publicUsage(document.usage)}</CodeBlock>
      </section>
      <section className="docs-section" aria-labelledby="source-title">
        <h2 id="source-title">View source</h2>
        <p>Start with the component definition, then open its supporting implementation as needed.</p>
        <ul className="docs-source-links">
          {sourceLinksForComponent(document.slug).map(({ label, href }) =>
            <li key={href}><a href={href}>{label}</a></li>
          )}
        </ul>
      </section>
      <section className="docs-section" aria-labelledby="api-title">
        <h2 id="api-title">API</h2>
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

export function DocumentationShell({ document }: Readonly<{ document: ComponentDocument }>) {
  useEffect(() => {
    window.document.title = `${document.title} – CharDesk Cell UI`;
    window.scrollTo(0, 0);
  }, [document.slug, document.title]);
  return (
    <>
      <header className="gallery-header">
        <a className="gallery-brand" href={defaultComponentHref}>CharDesk / Cell UI</a>
        <div className="gallery-appearance-controls"><GalleryFontSelect /><GalleryThemeToggle /></div>
      </header>
      <div className="gallery-layout">
        <GalleryNavigation activeSlug={document.slug} />
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
  const component = route.match(/^\/components\/([^/]+)$/);
  const document = component ? componentDocumentBySlug.get(component[1]!) : undefined;
  return document ? <DocumentationShell document={document} /> : <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><CellUiApp /></GalleryAppearance></StrictMode>,
);
