import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { ComplexWidgetsDemo } from "./sections/complex-widgets";
import { CoreControlsDemo } from "./sections/core-controls";
import { OverlayDemo } from "./sections/overlay";
import { TextEditingDemo } from "./sections/text-editing";
import { VirtualizationDemo } from "./sections/virtualization";
import "./styles.css";
import "@chardesk/fonts/fonts.css";
import { GalleryAppearance, GalleryBorderToggle, GalleryThemeToggle } from "./appearance";

export const GallerySection = ({
  id,
  title,
  description,
  children,
}: Readonly<{
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}>) => {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  const [copying, setCopying] = useState(false);
  const pendingCopy = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const copySnapshot = async () => {
    if (pendingCopy.current) return;
    pendingCopy.current = true;
    setCopying(true);
    clearTimeout(timer.current);
    setCopyState("idle");
    try {
      const surface = document.querySelector(`[data-cell-probe="${id}"]`);
      const snapshot = surface ? readCellSurfaceProbe(surface) : null;
      if (!snapshot) throw new Error("Snapshot is unavailable.");
      await navigator.clipboard.writeText(formatCellProbe(snapshot, { header: true }));
      if (alive.current) setCopyState("copied");
    } catch {
      if (alive.current) setCopyState("unavailable");
    } finally {
      pendingCopy.current = false;
      if (alive.current) {
        setCopying(false);
        timer.current = setTimeout(() => setCopyState("idle"), 2000);
      }
    }
  };
  return (
    <section
      id={id}
      className="gallery-card"
      aria-labelledby={`${id}-title`}
    >
      <header className="gallery-card__header">
        <div className="gallery-card__title-row">
          <h2 id={`${id}-title`}>{title}</h2>
          <div className="gallery-copy">
            <span aria-label="Copy feedback" aria-live="polite">
              {copyState === "copied" ? "Copied snapshot" : copyState === "unavailable" ? "Copy failed. Try again." : ""}
            </span>
            <button type="button" onClick={copySnapshot} disabled={copying}>Copy snapshot</button>
          </div>
        </div>
        <p>{description}</p>
      </header>
      <div className="gallery-card__demo">{children}</div>
    </section>
  );
};

export const WebTuiGallery = () => (
  <main>
    <header className="gallery-header">
      <p className="gallery-eyebrow">CharDesk Experiments</p>
      <div className="gallery-title-row">
        <h1>Cell UI Gallery</h1>
        <div className="gallery-appearance-controls"><GalleryBorderToggle /><GalleryThemeToggle /></div>
      </div>
      <p className="gallery-intro">
        Explore with your mouse or keyboard. Drag with ⌥⌘ on macOS or Alt
        elsewhere to select and copy a rectangle of text.
      </p>
    </header>
    <div className="gallery-layout">
      <nav aria-label="Gallery sections">
        <a href="#core">Core</a>
        <a href="#complex">Complex</a>
        <a href="#editor">Editing</a>
        <a href="#overlay">Overlay</a>
        <a href="#virtualization">Virtualization</a>
      </nav>

    <div className="gallery-grid">
      <GallerySection
        id="core"
        title="Core controls"
        description="Choose a command or browse the files."
      >
        <CoreControlsDemo />
      </GallerySection>
      <GallerySection
        id="complex"
        title="Complex widgets"
        description="Explore menus, files, tabs, and a property grid."
      >
        <ComplexWidgetsDemo />
      </GallerySection>
      <GallerySection
        id="editor"
        title="Text editing"
        description="Edit text, including Chinese and emoji."
      >
        <TextEditingDemo />
      </GallerySection>
      <GallerySection
        id="overlay"
        title="Overlay"
        description="Open the command palette. Press Escape to return."
      >
        <OverlayDemo />
      </GallerySection>
      <GallerySection
        id="virtualization"
        title="Virtualization"
        description="Browse 100,000 rows. Use Page Up and Page Down to jump."
      >
        <VirtualizationDemo />
      </GallerySection>
    </div>
    </div>
  </main>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><WebTuiGallery /></GalleryAppearance></StrictMode>
);
