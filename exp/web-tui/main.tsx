import { Fragment, StrictMode, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Check, CircleX, Copy, type LucideIcon } from "lucide-react";
import { formatCellProbe } from "@chardesk/cell-ui";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { ComplexWidgetsDemo } from "./sections/complex-widgets";
import { CoreControlsDemo } from "./sections/core-controls";
import { OverlayDemo } from "./sections/overlay";
import { TextEditingDemo } from "./sections/text-editing";
import { VirtualizationDemo } from "./sections/virtualization";
import {
  BoxComponentDemo,
  ListComponentDemo,
  ScrollAreaComponentDemo,
  TextComponentDemo,
} from "./sections/components";
import "./styles.css";
import "@chardesk/fonts/fonts.css";
import { GalleryAppearance, GalleryBorderToggle, GalleryIconButton, GalleryThemeToggle } from "./appearance";

type CopyState = "idle" | "pending" | "success" | "error";
const copyPresentation: Record<CopyState, Readonly<{ label: string; icon: LucideIcon }>> = {
  idle: { label: "Copy", icon: Copy },
  pending: { label: "Copy", icon: Copy },
  success: { label: "Copied", icon: Check },
  error: { label: "Copy failed", icon: CircleX },
};

type GalleryEntry = Readonly<{
  id: string;
  navTitle: string;
  title: string;
  description: string;
  Demo: ComponentType;
}>;
type GallerySubgroup = Readonly<{
  title: string | null;
  entries: readonly GalleryEntry[];
}>;
type GalleryGroup = Readonly<{
  title: string;
  subgroups: readonly GallerySubgroup[];
}>;

const galleryGroups: readonly GalleryGroup[] = [
  {
    title: "Core",
    subgroups: [{
      title: null,
      entries: [
        { id: "core", navTitle: "Core", title: "Core controls", description: "Choose a command or browse the files.", Demo: CoreControlsDemo },
        { id: "complex", navTitle: "Complex", title: "Complex widgets", description: "Explore menus, files, tabs, and a property grid.", Demo: ComplexWidgetsDemo },
        { id: "editor", navTitle: "Editing", title: "Text editing", description: "Edit text, including Chinese and emoji.", Demo: TextEditingDemo },
        { id: "overlay", navTitle: "Overlay", title: "Overlay", description: "Open the command palette. Press Escape to return.", Demo: OverlayDemo },
        { id: "virtualization", navTitle: "Virtualization", title: "Virtualization", description: "Browse 100,000 rows. Use Page Up and Page Down to jump.", Demo: VirtualizationDemo },
      ],
    }],
  },
  {
    title: "Components",
    subgroups: [
      {
        title: "Display and layout",
        entries: [
          { id: "component-text", navTitle: "Text", title: "Text", description: "Render text, Unicode, and Cell-native wrapping.", Demo: TextComponentDemo },
          { id: "component-box", navTitle: "Box", title: "Box", description: "Compose nested Cell layout, spacing, and borders.", Demo: BoxComponentDemo },
        ],
      },
      {
        title: "Input and selection",
        entries: [
          { id: "component-list", navTitle: "List", title: "List", description: "Move focus and confirm a selection.", Demo: ListComponentDemo },
        ],
      },
      {
        title: "Scrolling",
        entries: [
          { id: "component-scroll-area", navTitle: "ScrollArea", title: "ScrollArea", description: "Scroll overflowing rows with keys, wheel, track, or thumb.", Demo: ScrollAreaComponentDemo },
        ],
      },
    ],
  },
];

const galleryEntries = galleryGroups.flatMap((group) =>
  group.subgroups.flatMap((subgroup) => subgroup.entries));

const GalleryNavigation = () => (
  <nav className="gallery-nav" aria-label="Gallery sections">
    <ul className="gallery-nav__sections">
      {galleryGroups.map((group) => (
        <li className="gallery-nav__section" key={group.title}>
          <span className="gallery-nav__section-title">{group.title}</span>
          <ul>
            {group.subgroups.map((subgroup, index) => (
              <Fragment key={subgroup.title ?? `${group.title}-${index}`}>
                {subgroup.title && <li className="gallery-nav__subgroup">{subgroup.title}</li>}
                {subgroup.entries.map((entry) => (
                  <li key={entry.id}><a href={`#${entry.id}`}>{entry.navTitle}</a></li>
                ))}
              </Fragment>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </nav>
);

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
  const [copyState, setCopyState] = useState<CopyState>("idle");
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
    clearTimeout(timer.current);
    setCopyState("pending");
    try {
      const surface = document.querySelector(`[data-cell-probe="${id}"]`);
      const snapshot = surface ? readCellSurfaceProbe(surface) : null;
      if (!snapshot) throw new Error("Snapshot is unavailable.");
      await navigator.clipboard.writeText(formatCellProbe(snapshot, { header: true }));
      if (alive.current) setCopyState("success");
    } catch {
      if (alive.current) setCopyState("error");
    } finally {
      pendingCopy.current = false;
      if (alive.current) {
        timer.current = setTimeout(() => setCopyState("idle"), 2000);
      }
    }
  };
  const feedback = copyPresentation[copyState];
  const FeedbackIcon = feedback.icon;
  return (
    <section
      id={id}
      className="gallery-card"
      aria-labelledby={`${id}-title`}
    >
      <header className="gallery-card__header">
        <div className="gallery-card__title-row">
          <h2 id={`${id}-title`}>{title}</h2>
          <GalleryIconButton
            label={feedback.label}
            tooltip="Copy"
            aria-live="polite"
            data-copy-state={copyState}
            onClick={copySnapshot}
            disabled={copyState === "pending"}
          >
            <FeedbackIcon aria-hidden="true" />
          </GalleryIconButton>
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
      <GalleryNavigation />
      <div className="gallery-grid">
        {galleryEntries.map(({ Demo, ...entry }) => (
          <GallerySection
            id={entry.id}
            title={entry.title}
            description={entry.description}
            key={entry.id}
          >
            <Demo />
          </GallerySection>
        ))}
      </div>
    </div>
  </main>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode><GalleryAppearance><WebTuiGallery /></GalleryAppearance></StrictMode>
);
