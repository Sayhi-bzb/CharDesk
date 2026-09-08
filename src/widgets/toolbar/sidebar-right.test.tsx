import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SidebarRight } from "@/widgets/toolbar/sidebar-right";
import { useEditorStore } from "@/domains/canvas/testing";
import { useLibraryStore } from "@/domains/character-library/public";
import { SidebarProvider } from "@chardesk/ui";
import {
  STRUCTURED_COMPONENT_TEMPLATES,
  STRUCTURED_PAGE_TEMPLATES,
  getActiveStructuredTemplateDragId,
  getStructuredTemplatePreview,
  setActiveStructuredTemplateDragId,
} from "@/domains/structured-content/public";
import { setUiLanguage } from "@/shared/i18n";

const sortTemplateLabels = <T extends { id: string; label: string }>(
  templates: T[]
) =>
  [...templates].sort(
    (a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );

function SidebarRightForActiveMode({ readOnly = false }: { readOnly?: boolean } = {}) {
  const canvasMode = useEditorStore((state) => state.canvasMode);
  return <SidebarRight canvasMode={canvasMode} readOnly={readOnly} />;
}

describe("SidebarRight structured templates", () => {
  const initialState = useEditorStore.getState();
  const initialLibraryState = useLibraryStore.getState();

  beforeEach(() => {
    setUiLanguage("en");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setActiveStructuredTemplateDragId(null);
    setUiLanguage("en");
    useEditorStore.setState(initialState, true);
    useLibraryStore.setState(initialLibraryState, true);
  });

  it("keeps the header toggle aligned with the left rail when collapsed", () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );
    const toggle = screen.getByRole("button", { name: /toggle sidebar/i });
    const toggleColumn = screen.getByTestId("sidebar-toggle-column");
    const railColumn = screen.getByTestId("sidebar-view-rail-column");

    expect(toggleColumn).toHaveClass("col-start-1", "row-start-1");
    expect(railColumn).toHaveClass("col-start-1", "row-start-1");

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBe(toggle);
    expect(screen.getByTestId("sidebar-toggle-column")).toBe(toggleColumn);
    expect(toggleColumn).toHaveClass("col-start-1", "row-start-1");
    expect(screen.getByTestId("sidebar-view-rail-column")).toBe(railColumn);
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      "data-state",
      "collapsed"
    );
  });

  it("shows structured templates instead of the character library in structured mode", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    useEditorStore.setState({ canvasMode: "structured" });

    const { container } = render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );
    const content = container.querySelector('[data-slot="sidebar-content"]');
    const header = container.querySelector('[data-slot="sidebar-header"]');
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    const sidebarSurface = container.querySelector('[data-slot="sidebar-container"]');
    const sidebarInner = container.querySelector('[data-slot="sidebar-inner"]');
    const group = container.querySelector('[data-slot="sidebar-group"]');
    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    const scrollViewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]'
    );
    const scrollContent = container.querySelector(
      '[data-slot="scroll-area-content"]'
    );
    const button = screen.getByRole("button", { name: /button/i });
    const search = screen.getByRole("searchbox", {
      name: "Search structured library",
    });

    expect(header).not.toHaveTextContent("Template");
    expect(header).not.toHaveTextContent("Components");
    expect(header).not.toHaveClass("border-b");
    expect(footer).toBeNull();
    expect(sidebarSurface).toHaveClass(
      "border-0",
      "bg-host-surface",
      "shadow-host"
    );
    expect(sidebarInner).toHaveClass("overflow-hidden", "bg-transparent");
    expect(sidebarInner).not.toHaveClass("shadow-host");
    expect(header).toContainElement(search);
    expect(search).toHaveClass("border-0", "bg-search-surface");
    expect(content).not.toContainElement(search);
    expect(content).toHaveClass("min-h-0", "overflow-hidden");
    expect(content).not.toHaveClass("overflow-y-auto");
    expect(content).not.toHaveClass("[scrollbar-gutter:auto]");
    expect(content).not.toHaveClass("[scrollbar-gutter:stable]");
    expect(content?.querySelectorAll('[data-slot="scroll-area"]')).toHaveLength(
      1
    );
    expect(scrollArea).toHaveClass("min-h-0", "group/content-scroll-area");
    expect(scrollViewport).toHaveClass("[&>div]:!block");
    expect(scrollContent).toHaveClass("min-w-0", "pr-1");
    expect(
      screen.queryByTestId("sidebar-view-content-inner")
    ).not.toBeInTheDocument();
    expect(scrollArea).not.toHaveClass("overflow-hidden");
    expect(
      scrollArea?.querySelector('[data-slot="scroll-area-scrollbar"]')
    ).toBeInTheDocument();
    expect(content).toHaveClass("p-0");
    expect(content).not.toHaveClass("pb-12");
    const structuredRail = screen.getByTestId("structured-view-rail-vertical");
    const structuredRailSlot = structuredRail.parentElement;
    const toggleColumn = screen.getByTestId("sidebar-toggle-column");
    const headerContent = screen.getByTestId("sidebar-header-content");
    expect(structuredRail).toHaveAttribute("aria-orientation", "vertical");
    expect(structuredRail).toHaveClass(
      "bg-secondary/70",
      "rounded-surface",
      "border-0",
      "shadow-none",
      "ring-0"
    );
    expect(header).toHaveClass(
      "grid-cols-[var(--sidebar-width-icon)_minmax(0,1fr)]",
      "px-0"
    );
    expect(headerContent).toHaveClass(
      "col-start-2",
      "row-start-1",
      "overflow-hidden",
      "py-px"
    );
    expect(structuredRailSlot?.parentElement).toHaveClass(
      "grid-cols-[var(--sidebar-width-icon)_minmax(0,1fr)]"
    );
    expect(structuredRailSlot).toHaveClass(
      "col-start-1",
      "row-start-1",
      "px-0"
    );
    expect(toggleColumn).toHaveClass("col-start-1", "row-start-1");
    expect(scrollArea).toHaveClass("col-start-2", "row-start-1");
    expect(screen.getByRole("tab", { name: "Template" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.getByRole("tab", { name: "Components" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.getByRole("tabpanel", { name: "Components" })
    ).toBeInTheDocument();
    expect(scrollViewport).not.toContainElement(
      screen.getByRole("tab", { name: "Components" })
    );
    expect(screen.getByRole("tab", { name: "Components" })).toHaveClass(
      "bg-control-active-surface",
      "rounded-control",
      "hover:bg-control-active-surface",
      "hover:text-foreground"
    );
    expect(screen.getByRole("tab", { name: "Template" })).toHaveClass(
      "hover:bg-accent",
      "hover:text-accent-foreground"
    );
    expect(
      screen.queryByTestId("structured-sidebar-active-tab-line")
    ).not.toBeInTheDocument();
    expect(button).toHaveAttribute("data-onboarding-template-id", "button");
    const templateItems = Array.from(
      group?.querySelectorAll('button[draggable="true"]') ?? []
    );
    const sortedTemplates = sortTemplateLabels(STRUCTURED_COMPONENT_TEMPLATES);
    const templateGrid = screen.getByTestId("structured-template-grid");
    expect(templateGrid).toHaveClass("grid", "grid-cols-1", "gap-1", "p-1");
    expect(templateItems).toHaveLength(STRUCTURED_COMPONENT_TEMPLATES.length);
    const templateSeparators = group?.querySelectorAll(
      '[data-slot="structured-template-separator"]'
    );
    expect(templateSeparators).toHaveLength(0);
    const itemLabels = templateItems.map(
      (item) => item.querySelector(":scope > span:last-child")?.textContent
    );
    expect(itemLabels).toEqual(
      sortedTemplates.map((template) => template.label)
    );
    sortedTemplates.forEach((template, index) => {
      const item = templateItems[index];
      const viewport = item.querySelector(
        '[data-testid="structured-template-preview-viewport"]'
      );
      const preview = item.querySelector(
        '[data-testid="structured-template-preview-grid"]'
      );
      expect(viewport).toHaveClass(
        "aspect-video",
        "w-full",
        "bg-transparent",
        "border-0",
        "overflow-hidden"
      );
      expect(viewport).not.toHaveClass(
        "border",
        "border-border",
        "bg-muted/40"
      );
      expect(preview?.tagName).toBe("CANVAS");
      expect(preview).toHaveAttribute("data-fit", "contain");
      expect(preview).toHaveStyle({
        width: "100%",
        height: "100%",
      });
      expect(item).toHaveTextContent(template.label);
      expect(item).toHaveClass(
        "flex-col",
        "items-stretch",
        "rounded-item",
        "text-center"
      );
      expect(item.querySelector(":scope > span:last-child")).not.toHaveClass(
        "font-semibold"
      );
    });
    const buttonIndex = sortedTemplates.findIndex(
      (template) => template.id === "button"
    );
    const buttonPreview = templateItems[buttonIndex].querySelector(
      '[data-testid="structured-template-preview-grid"]'
    );
    expect(buttonPreview?.tagName).toBe("CANVAS");
    expect(group).toHaveClass("p-0");
    expect(button).toHaveClass("flex-col", "items-stretch", "gap-1");
    expect(
      screen.queryByRole("button", { name: /amibios/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /safari/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /file tree/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /timeline/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /snippet/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /terminal/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /phone/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Nerd Icons")).not.toBeInTheDocument();
  });

  it("does not render the migrated utility footer", () => {
    const { container } = render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    expect(container.querySelector('[data-slot="sidebar-footer"]')).toBeNull();
    expect(
      screen.queryByTestId("sidebar-footer-actions")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Source Code" })
    ).not.toBeInTheDocument();
  });

  it("switches icon-only character views and preserves scoped search", async () => {
    useEditorStore.setState({ canvasMode: "freeform" });
    useLibraryStore.setState({
      loadMainPacks: vi.fn(),
      packs: {
        essentials: [{ id: "ascii", label: "ASCII", entries: [] }],
        nerd: [{ id: "icons", label: "Icons", entries: [] }],
        emoji: [{ id: "faces", label: "Faces", entries: [] }],
      },
      packStatus: { essentials: "ready", nerd: "ready", emoji: "ready" },
      searchQueries: { essentials: "", nerd: "", emoji: "" },
      searchResults: { essentials: [], nerd: [], emoji: [] },
    });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    const rail = screen.getByTestId("character-view-rail-vertical");
    expect(rail).toHaveAttribute("data-onboarding-target", "character-library");
    const railSlot = rail.parentElement;
    const scrollArea = railSlot?.parentElement?.querySelector(
      '[data-slot="scroll-area"]'
    );
    const tabs = screen.getAllByRole("tab");
    expect(rail).toHaveClass("bg-secondary/70", "p-1");
    expect(rail).toHaveClass("items-center");
    expect(rail.parentElement).not.toHaveClass("border-r", "border-b");
    expect(railSlot?.parentElement).toHaveClass(
      "grid-cols-[var(--sidebar-width-icon)_minmax(0,1fr)]"
    );
    expect(railSlot).toHaveClass("col-start-1", "row-start-1", "px-0");
    expect(scrollArea).toHaveClass("col-start-2", "row-start-1");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Essentials",
      "Nerd Icons",
      "Emoji",
      "Unicode",
    ]);
    expect(screen.getByRole("tab", { name: "Essentials" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Nerd Icons" }));
    expect(
      screen.getByRole("tabpanel", { name: "Nerd Icons characters" })
    ).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search characters" });
    fireEvent.change(search, { target: { value: "folder" } });
    await waitFor(() =>
      expect(useLibraryStore.getState().searchQueries.nerd).toBe("folder")
    );

    fireEvent.click(screen.getByRole("tab", { name: "Emoji" }));
    expect(
      screen.getByRole("searchbox", { name: "Search characters" })
    ).toHaveValue("");
    fireEvent.click(screen.getByRole("tab", { name: "Nerd Icons" }));
    const restoredSearch = screen.getByRole("searchbox", {
      name: "Search characters",
    });
    expect(restoredSearch).toHaveValue("folder");
    expect(restoredSearch).toHaveClass(
      "[&::-webkit-search-cancel-button]:hidden"
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(restoredSearch).toHaveValue("");
    expect(restoredSearch).toHaveFocus();

    fireEvent.change(restoredSearch, { target: { value: "folder" } });
    fireEvent.keyDown(restoredSearch, { key: "Escape" });
    expect(restoredSearch).toHaveValue("");
    expect(restoredSearch).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Clear search" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Unicode" }));
    const unicodeSearch = screen.getByRole("searchbox", {
      name: "Search characters",
    });
    fireEvent.change(unicodeSearch, { target: { value: "arrow" } });
    expect(
      screen.getByRole("button", { name: "Clear search" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search all Unicode" })
    ).toBeInTheDocument();
    expect(unicodeSearch).toHaveClass("pr-16");
  });

  it("closes the Unicode facet Select when its trigger is pressed again", async () => {
    useEditorStore.setState({ canvasMode: "freeform" });
    useLibraryStore.setState({
      loadMainPacks: vi.fn(),
      loadUnicodeManifest: vi.fn().mockResolvedValue(undefined),
      loadUnicodePage: vi.fn().mockResolvedValue(undefined),
      unicodeManifest: {
        schemaVersion: 1,
        unicodeVersion: "17.0.0",
        shardSize: 1024,
        shards: {},
        nameIndex: "unicode/name-index.json",
        facets: {
          block: [
            {
              id: "basic-latin",
              label: "Basic Latin",
              count: 95,
              ranges: [[32, 126]],
            },
          ],
          script: [
            {
              id: "latin",
              label: "Latin",
              count: 1374,
              ranges: [[65, 90]],
            },
          ],
          category: [
            {
              id: "uppercase-letter",
              label: "Uppercase Letter",
              count: 1858,
              ranges: [[65, 90]],
            },
          ],
        },
      },
      unicodeStatus: "ready",
      unicodeError: null,
      unicodeFacetType: "block",
      unicodeFacetId: "basic-latin",
      unicodeResults: [],
      unicodeOffset: 0,
      unicodeHasMore: false,
    });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    fireEvent.click(screen.getByRole("tab", { name: "Unicode" }));
    const trigger = screen.getByRole("combobox", { name: "Unicode facet" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: "mouse",
    });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    fireEvent.pointerDown(document.body, {
      button: 0,
      ctrlKey: false,
      pointerId: 2,
      pointerType: "mouse",
    });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("moves Add slide into the Slides header", async () => {
    useEditorStore.setState({
      canvasMode: "slide",
      slideDeck: {
        activeSlideId: "slide-1",
        slides: [
          {
            id: "slide-1",
            name: "Slide 1",
            size: { columns: 100, rows: 27 },
          },
        ],
      },
    });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    const headerContent = screen.getByTestId("sidebar-header-content");
    const navigator = screen.getByTestId("slide-navigator");
    const addSlide = screen.getByRole("button", { name: "Add slide" });
    const slideViewTabs = within(
      screen.getByTestId("slide-view-rail-vertical")
    ).getAllByRole("tab");

    expect(headerContent).toContainElement(addSlide);
    expect(navigator).not.toContainElement(addSlide);
    expect(within(headerContent).queryByText("Slides", { exact: true })).not.toBeInTheDocument();
    expect(slideViewTabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Slides",
      "Essentials",
      "Nerd Icons",
      "Emoji",
      "Unicode",
    ]);
    fireEvent.focus(slideViewTabs[0]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Slides");
    fireEvent.blur(slideViewTabs[0]);
    fireEvent.keyDown(document, { key: "Escape" });

    const deleteSlide = screen.getByRole("button", { name: "Delete Slide 1" });
    expect(deleteSlide).toBeDisabled();
    expect(deleteSlide).not.toHaveAttribute("title");
    expect(deleteSlide.parentElement).toHaveAttribute("data-base-ui-tooltip-trigger");

    const configureSlide = screen.getByRole("button", {
      name: "Configure slide size for Slide 1",
    });
    fireEvent.focus(configureSlide);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Configure");

    fireEvent.click(addSlide);

    expect(useEditorStore.getState().slideDeck?.slides).toHaveLength(2);
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe(
      useEditorStore.getState().slideDeck?.slides[1].id
    );
  });

  it("renders source-backed Slides as navigation-only", () => {
    useEditorStore.setState({
      canvasMode: "slide",
      slideDeck: {
        activeSlideId: "slide-1",
        slides: [
          {
            id: "slide-1",
            name: "Opening",
            size: { columns: 30, rows: 12 },
          },
          {
            id: "slide-2",
            name: "Details",
            size: { columns: 40, rows: 16 },
          },
        ],
      },
    });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode readOnly />
      </SidebarProvider>
    );

    expect(screen.getByTestId("sidebar-header-content"))
      .toHaveTextContent("Slides");
    expect(screen.queryByTestId("slide-view-rail-vertical"))
      .not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-view-rail-column"))
      .not.toBeInTheDocument();
    expect(screen.getByTestId("slide-navigator"))
      .toHaveAttribute("data-read-only", "true");
    expect(screen.getByRole("list", { name: "Slides" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add slide" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Configure slide size/ }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Rename/ }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Slide 2 of 2: Details",
    }));
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-2");
    expect(document.querySelector("[data-reorder-item]"))
      .not.toBeInTheDocument();
  });

  it("collapses to only the trigger and preserves the selected character view", () => {
    useEditorStore.setState({ canvasMode: "freeform" });
    useLibraryStore.setState({ loadMainPacks: vi.fn() });

    const { container } = render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    const rail = screen.getByTestId("character-view-rail-vertical");
    const headerContent = screen.getByTestId("sidebar-header-content");
    const content = container.querySelector('[data-slot="sidebar-content"]');
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const surface = container.querySelector('[data-slot="sidebar-container"]');
    const inner = container.querySelector('[data-slot="sidebar-inner"]');

    fireEvent.click(screen.getByRole("tab", { name: "Emoji" }));
    expect(screen.getByRole("tab", { name: "Emoji" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(trigger);

    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsed-appearance", "trigger");
    expect(content).toHaveAttribute("aria-hidden", "true");
    expect(content).toHaveAttribute("inert");
    expect(headerContent).toHaveAttribute("aria-hidden", "true");
    expect(headerContent).toHaveAttribute("inert");
    expect(surface).toHaveAttribute("data-motion-phase", "collapsing");
    expect(surface).toHaveClass("bg-host-surface", "shadow-host");
    expect(surface).toHaveClass(
      "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]",
      "pointer-events-auto",
      "transition-[--chardesk-sidebar-height,background-color,box-shadow]"
    );
    expect(inner).toHaveClass("overflow-hidden", "bg-transparent");
    expect(trigger).toHaveClass("size-8", "pointer-events-auto");
    expect(trigger).not.toHaveClass("bg-muted");
    expect(screen.getAllByRole("button")).toEqual([trigger]);
    expect(
      screen.queryByRole("tab", { name: "Emoji" })
    ).not.toBeInTheDocument();

    fireEvent.transitionEnd(surface!, {
      propertyName: "--chardesk-sidebar-height",
    });

    expect(surface).toHaveAttribute("data-motion-phase", "collapsed");
    expect(surface).toHaveClass("bg-transparent", "shadow-none");
    expect(surface).not.toHaveClass("bg-host-surface", "shadow-host");

    fireEvent.click(trigger);

    expect(surface).toHaveAttribute("data-motion-phase", "expanding");
    expect(surface).toHaveClass("[--chardesk-sidebar-height:100%]");
    expect(surface).not.toHaveClass(
      "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]"
    );
    expect(screen.getByTestId("character-view-rail-vertical")).toBe(rail);
    expect(screen.getByRole("tab", { name: "Emoji" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(headerContent).not.toHaveAttribute("aria-hidden");
    expect(headerContent).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("tabpanel", { name: "Emoji characters" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search characters" })
    ).toBeInTheDocument();
  });



  it("switches structured sidebar tabs between templates and components", () => {
    useEditorStore.setState({ canvasMode: "structured" });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    expect(screen.getByRole("button", { name: /button/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Template" }));

    expect(screen.getByRole("tab", { name: "Template" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /amibios/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /safari/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /file tree/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /timeline/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /snippet/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /terminal/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phone/i })).toBeInTheDocument();
    expect(STRUCTURED_PAGE_TEMPLATES.map((template) => template.id)).toEqual([
      "amibios",
      "spotify",
      "safari",
      "filetree",
      "timeline",
      "snippet",
      "terminal",
      "phone",
    ]);
    expect(
      screen.queryByRole("button", { name: /button/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No templates found")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Components" }));

    expect(screen.getByRole("tab", { name: "Components" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("button", { name: /button/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /amibios/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /safari/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /file tree/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /timeline/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /snippet/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /terminal/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /phone/i })
    ).not.toBeInTheDocument();
  });

  it("filters structured components from the main header search", () => {
    useEditorStore.setState({ canvasMode: "structured" });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    const search = screen.getByRole("searchbox", {
      name: "Search structured library",
    });
    expect(search).toHaveClass(
      "bg-search-surface",
      "border-0",
      "shadow-none",
      "focus-visible:ring-2",
      "focus-visible:ring-ring/45",
      "focus-visible:ring-inset"
    );
    expect(search).not.toHaveClass("bg-accent/60", "focus-visible:ring-1");
    expect(search).toHaveClass(
      "[&::-webkit-search-cancel-button]:hidden"
    );

    fireEvent.change(search, { target: { value: "badge" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "badge" } });
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "badge" } });

    expect(screen.getByRole("button", { name: /badge/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /button/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "accordion" } });

    expect(
      screen.getByRole("button", { name: /accordion/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /badge/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "status" } });

    expect(screen.getByRole("button", { name: /status/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /accordion/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "calendar" } });

    expect(
      screen.getByRole("button", { name: /calendar/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /status/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "alert" } });

    expect(screen.getByRole("button", { name: /alert/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /calendar/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "switch" } });

    expect(screen.getByRole("button", { name: /switch/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /alert/i })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "missing" } });

    expect(screen.getByText("No components found")).toHaveClass("col-span-full");
  });

  it("keeps the search header outside structured mode", () => {
    useEditorStore.setState({ canvasMode: "freeform" });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    expect(
      screen.queryByRole("tab", { name: "Template" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Components" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: "Search structured library" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No templates found")).not.toBeInTheDocument();
  });

  it("hides structured controls when collapsed and restores their state", () => {
    useEditorStore.setState({ canvasMode: "structured" });

    const { container } = render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    const rail = screen.getByTestId("structured-view-rail-vertical");
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    const content = container.querySelector('[data-slot="sidebar-content"]');

    fireEvent.click(screen.getByRole("tab", { name: "Template" }));
    fireEvent.click(trigger);

    expect(content).toHaveAttribute("aria-hidden", "true");
    expect(content).toHaveAttribute("inert");
    expect(screen.getAllByRole("button")).toEqual([trigger]);
    expect(
      screen.queryByRole("tab", { name: "Template" })
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByTestId("structured-view-rail-vertical")).toBe(rail);
    expect(screen.getByRole("tab", { name: "Template" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.getByRole("tabpanel", { name: "Template" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search structured library" })
    ).toBeInTheDocument();
  });

  it("renders localized operation labels without changing template labels", () => {
    useEditorStore.setState({ canvasMode: "structured" });
    setUiLanguage("zh");

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    expect(
      screen.getByRole("searchbox", { name: "搜索结构库" })
    ).toHaveAttribute("placeholder", "搜索");
    expect(screen.getByRole("tab", { name: "模板" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "组件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /button/i })).toBeInTheDocument();
  });

  it("localizes freeform Sidebar Host labels without translating standard terms", () => {
    useEditorStore.setState({ canvasMode: "freeform" });
    setUiLanguage("zh");

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );

    expect(screen.getByRole("tablist", { name: "字符库视图" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "常用" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Nerd Icons" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Emoji" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unicode" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "常用字符" })).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "搜索字符" });
    expect(search).toHaveAttribute("placeholder", "搜索当前视图");
    expect(search).toHaveClass(
      "bg-search-surface",
      "border-0",
      "shadow-none",
      "focus-visible:ring-2",
      "focus-visible:ring-ring/45",
      "focus-visible:ring-inset"
    );
    expect(search).not.toHaveClass("bg-accent/60", "focus-visible:ring-1");
    expect(screen.getByRole("button", { name: "切换侧栏" })).toBeInTheDocument();
  });

  it("hands the structured drag preview from the sidebar overlay to the canvas", async () => {
    useEditorStore.setState({
      canvasMode: "structured",
      brushColor: "#334155",
    });

    render(
      <SidebarProvider>
        <SidebarRightForActiveMode />
      </SidebarProvider>
    );
    const mountedNativeDragImage = document.querySelector<HTMLCanvasElement>(
      '[data-slot="native-drag-image"]'
    );
    expect(mountedNativeDragImage).toBeInTheDocument();
    expect(mountedNativeDragImage?.parentElement).toBe(document.body);
    const button = screen.getByRole("button", { name: /button/i });
    const preview = within(button).getByTestId(
      "structured-template-preview-viewport"
    );
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      bottom: 70,
      height: 50,
      left: 10,
      right: 110,
      top: 20,
      width: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const setDragImage = vi.fn();
    const dragStartEvent = createEvent.dragStart(button);
    Object.defineProperties(dragStartEvent, {
      clientX: { value: 82 },
      clientY: { value: 64 },
      dataTransfer: {
        value: {
          effectAllowed: "none",
          setData: vi.fn(),
          setDragImage,
        },
      },
    });

    fireEvent(button, dragStartEvent);

    expect(getActiveStructuredTemplateDragId()).toBe("button");
    expect(setDragImage).toHaveBeenCalledTimes(1);
    const nativeDragImage = setDragImage.mock.calls[0][0] as HTMLElement;
    expect(nativeDragImage).toBe(mountedNativeDragImage);
    expect(nativeDragImage.tagName).toBe("CANVAS");
    expect(nativeDragImage).toHaveAttribute("data-slot", "native-drag-image");
    expect(nativeDragImage.isConnected).toBe(true);
    expect(nativeDragImage).toHaveClass(
      "pointer-events-none",
      "fixed",
      "left-0",
      "top-0",
      "size-px"
    );
    expect(nativeDragImage.style.opacity).toBe("");
    expect(preview).toHaveAttribute(
      "data-slot",
      "structured-template-preview"
    );
    const overlay = screen.getByTestId("structured-template-drag-overlay");
    expect(overlay).toHaveStyle({
      width: "100px",
      height: "50px",
      transform: "translate3d(10px, 20px, 0)",
    });
    expect(overlay.querySelector("canvas")).toHaveAttribute(
      "data-preview-mode",
      "characters"
    );
    expect(overlay).not.toHaveTextContent("Button");

    const canvasSurface = document.createElement("div");
    canvasSurface.dataset.slot = "canvas-surface";
    document.body.appendChild(canvasSurface);
    const canvasDragOver = createEvent.dragOver(canvasSurface);
    Object.defineProperties(canvasDragOver, {
      clientX: { value: 240 },
      clientY: { value: 160 },
    });
    fireEvent(canvasSurface, canvasDragOver);
    expect(
      screen.queryByTestId("structured-template-drag-overlay")
    ).not.toBeInTheDocument();
    expect(nativeDragImage.isConnected).toBe(true);

    const chromeDragOver = createEvent.dragOver(document.body);
    Object.defineProperties(chromeDragOver, {
      clientX: { value: 120 },
      clientY: { value: 90 },
    });
    fireEvent(document.body, chromeDragOver);
    expect(
      screen.queryByTestId("structured-template-drag-overlay")
    ).not.toBeInTheDocument();

    const sidebarDragOver = createEvent.dragOver(button);
    Object.defineProperties(sidebarDragOver, {
      clientX: { value: 82 },
      clientY: { value: 64 },
    });
    fireEvent(button, sidebarDragOver);
    expect(
      screen.getByTestId("structured-template-drag-overlay")
    ).toBeInTheDocument();
    canvasSurface.remove();

    fireEvent.dragEnd(button);
    expect(getActiveStructuredTemplateDragId()).toBeNull();
    expect(nativeDragImage.isConnected).toBe(true);
    expect(
      screen.queryByTestId("structured-template-drag-overlay")
    ).not.toBeInTheDocument();
  });

  it("reuses cached structured template preview data", () => {
    expect(getStructuredTemplatePreview("button")).toBe(
      getStructuredTemplatePreview("button")
    );
  });
});
