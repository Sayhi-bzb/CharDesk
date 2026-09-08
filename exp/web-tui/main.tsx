import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from "react";
import { createRoot } from "react-dom/client";
import { Check } from "pixelarticons/react/Check";
import { Close } from "pixelarticons/react/Close";
import { Copy } from "pixelarticons/react/Copy";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { componentDocumentBySlug, componentDocuments, type ComponentDocument } from "./component-catalog";
import { FixturePage } from "./fixtures";
import { GalleryAppearance, GalleryBorderToggle, GalleryFontSelect, GalleryIconButton, GalleryThemeToggle } from "./appearance";
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
const readRoute = () => window.location.hash.slice(1) || "/components/text";
const useRoute = () => useSyncExternalStore(subscribeToHash, readRoute, () => "/components/text");

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

const workspaceDependency = `{
  "dependencies": {
    "@chardesk/cell-ui": "*"
  }
}`;

export function GalleryNavigation({ activeSlug }: Readonly<{ activeSlug: string }>) {
  return (
    <nav className="gallery-nav" aria-label="Components">
      <span className="gallery-nav__title">Components</span>
      <ul>
        {componentDocuments.map((document) => (
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
          Currently available as a private workspace package. It is not published to npm and
          does not provide a registry or <code>add</code> command.
        </p>
        <p>Add the dependency to a workspace package, then run <code>npm install</code> at the repository root.</p>
        <CodeBlock>{workspaceDependency}</CodeBlock>
        <p>
          Import Cell descriptors from <code>@chardesk/cell-ui</code>. Import the browser Surface
          and state adapters from <code>@chardesk/cell-ui/browser</code>.
        </p>
      </section>
      <section className="docs-section" aria-labelledby="usage-title">
        <h2 id="usage-title">Usage</h2>
        <CodeBlock>{document.usage}</CodeBlock>
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
        <a className="gallery-brand" href="#/components/text">CharDesk / Cell UI</a>
        <div className="gallery-appearance-controls"><GalleryFontSelect /><GalleryBorderToggle /><GalleryThemeToggle /></div>
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
      <p><a href="#/components/text">Open Text</a></p>
    </main>
  );
}

export function WebTuiApp(): ReactNode {
  const route = useRoute();
  useEffect(() => {
    if (!window.location.hash) window.location.replace("#/components/text");
  }, []);
  const fixture = route.match(/^\/__fixtures\/([^/]+)$/);
  if (fixture) return <FixturePage slug={fixture[1]!} />;
  const component = route.match(/^\/components\/([^/]+)$/);
  const document = component ? componentDocumentBySlug.get(component[1]!) : undefined;
  return document ? <DocumentationShell document={document} /> : <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><WebTuiApp /></GalleryAppearance></StrictMode>,
);
