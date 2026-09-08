import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultCanvasDocuments,
  useEditorStore,
} from "@/domains/canvas/testing";
import { ShortcutProvider } from "@/shared/shortcuts/dispatcher";
import { SlideNavigator } from "./slide-navigator";
import { ZoomControl } from "./zoom-control";

vi.mock("@/shared/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const initialState = useEditorStore.getState();
const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenElement"
);
const originalRequestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "requestFullscreen"
);
const originalExitFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "exitFullscreen"
);

describe("ZoomControl slide playback", () => {
  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let intersectionVisible: boolean;

  beforeEach(() => {
    intersectionVisible = true;
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: class IntersectionObserverMock {
        readonly callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        observe = vi.fn((target: Element) => {
          this.callback(
            [{ isIntersecting: intersectionVisible, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
        });
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "240px 0px";
        thresholds = [0];
      },
    });
    fullscreenElement = null;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    const sessionId = useEditorStore.getState().activeCanvasId;
    defaultCanvasDocuments.activateDocument(sessionId, {
      mode: "slide",
      activePageId: "slide-2",
      pages: [
        {
          id: "slide-1",
          name: "First",
          size: { columns: 3, rows: 2 },
          kind: "cell-plane",
          grid: [["2,1", { char: "A", color: "#000" }]],
        },
        {
          id: "slide-2",
          name: "Second",
          size: { columns: 3, rows: 2 },
          kind: "cell-plane",
          grid: [],
        },
      ],
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });
    useEditorStore.setState({
      canvasMode: "slide",
      slideDeck: {
        activeSlideId: "slide-2",
        slides: [
          {
            id: "slide-1",
            name: "First",
            size: { columns: 3, rows: 2 },
          },
          { id: "slide-2", name: "Second", size: { columns: 3, rows: 2 } },
        ],
      },
    });
  });

  afterEach(() => {
    useEditorStore.setState(initialState, true);
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    if (originalFullscreenDescriptor) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreenDescriptor);
    } else {
      Reflect.deleteProperty(document, "fullscreenElement");
    }
    if (originalRequestFullscreenDescriptor) {
      Object.defineProperty(
        document.documentElement,
        "requestFullscreen",
        originalRequestFullscreenDescriptor
      );
    } else {
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
    if (originalExitFullscreenDescriptor) {
      Object.defineProperty(document, "exitFullscreen", originalExitFullscreenDescriptor);
    } else {
      Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("keeps slide metadata mounted without drawing offscreen previews", () => {
    intersectionVisible = false;
    useEditorStore.setState({
      slideDeck: {
        activeSlideId: "slide-1",
        slides: Array.from({ length: 30 }, (_, index) => ({
          id: `slide-${index + 1}`,
          name: `Slide ${index + 1}`,
          size: { columns: 100, rows: 27 },
          grid: [],
        })),
      },
    });

    render(<SlideNavigator />);

    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(screen.queryAllByTestId("slide-preview-canvas")).toHaveLength(0);
  });

  it("commits the last presented slide when fullscreen exits", async () => {
    render(
      <ShortcutProvider>
        <ZoomControl containerSize={{ width: 1000, height: 700 }} />
      </ShortcutProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("slide-playback")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Second" })).toBeInTheDocument();
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-2");

    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(screen.getByRole("img", { name: "First" })).toBeInTheDocument();
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-2");

    fullscreenElement = null;
    fireEvent(document, new Event("fullscreenchange"));
    await waitFor(() =>
      expect(screen.queryByTestId("slide-playback")).not.toBeInTheDocument()
    );
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-1");
  });

  it("keeps the window overlay open when fullscreen is rejected", async () => {
    requestFullscreen.mockRejectedValueOnce(new Error("denied"));
    render(
      <ShortcutProvider>
        <ZoomControl containerSize={{ width: 1000, height: 700 }} />
      </ShortcutProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(await screen.findByTestId("slide-playback-warning")).toHaveTextContent(
      "Fullscreen was unavailable. Playing in this window instead."
    );
    expect(screen.getByTestId("slide-playback-warning")).toHaveClass("text-warning");
    expect(screen.getByTestId("slide-playback")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit presentation" }));

    expect(screen.queryByTestId("slide-playback")).not.toBeInTheDocument();
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-1");
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it("shows the same inline warning when the Fullscreen API is unavailable", async () => {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    render(
      <ShortcutProvider>
        <ZoomControl containerSize={{ width: 1000, height: 700 }} />
      </ShortcutProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(await screen.findByTestId("slide-playback-warning")).toBeInTheDocument();
    expect(screen.getByTestId("slide-playback-warning")).toHaveClass("text-warning");
    expect(screen.getByTestId("slide-playback")).toBeInTheDocument();
  });

  it("keeps playback and slide creation actions outside the slide navigator", () => {
    render(<SlideNavigator />);

    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add slide" })).not.toBeInTheDocument();
    const slideList = screen.getByRole("list", { name: "Slides, reorderable" });
    expect(slideList.querySelectorAll(":scope > li > span")).toHaveLength(0);
    const firstSlide = screen.getByRole("button", {
      name: "Slide 1 of 2: First",
    });
    const secondSlide = screen.getByRole("button", {
      name: "Slide 2 of 2: Second, current",
    });
    expect(firstSlide.querySelector("pre")).not.toBeInTheDocument();
    expect(firstSlide.querySelector("canvas")).toHaveAttribute(
      "data-testid",
      "slide-preview-canvas"
    );
    expect(firstSlide.parentElement).not.toHaveClass(
      "border",
      "border-primary",
      "bg-background",
      "ring-1"
    );
    expect(secondSlide.parentElement).not.toHaveClass(
      "border",
      "border-primary",
      "bg-background",
      "ring-1"
    );
    expect(firstSlide.parentElement).not.toHaveAttribute("data-selected");
    expect(firstSlide.parentElement).not.toHaveClass(
      "bg-control-active-surface"
    );
    expect(secondSlide.parentElement).toHaveAttribute("data-selected", "true");
    expect(secondSlide.parentElement).toHaveClass(
      "bg-control-active-surface"
    );
    expect(firstSlide).not.toHaveAttribute("data-selected");
    expect(firstSlide).not.toHaveClass("bg-control-active-surface");
    expect(secondSlide).toHaveAttribute("data-selected", "true");
    expect(secondSlide).toHaveClass("bg-control-active-surface", "text-foreground");

    fireEvent.click(firstSlide);

    expect(firstSlide.parentElement).toHaveAttribute("data-selected", "true");
    expect(firstSlide.parentElement).toHaveClass("bg-control-active-surface");
    expect(secondSlide.parentElement).not.toHaveAttribute("data-selected");
    expect(secondSlide.parentElement).not.toHaveClass(
      "bg-control-active-surface"
    );
    expect(firstSlide).toHaveAttribute("data-selected", "true");
    expect(firstSlide).toHaveClass("bg-control-active-surface", "text-foreground");
    expect(secondSlide).not.toHaveAttribute("data-selected");
    expect(secondSlide).not.toHaveClass("bg-control-active-surface");

    expect(
      screen.getByRole("group", { name: "Actions for First" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Configure slide size for First" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Duplicate First" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete First" })
    ).toBeInTheDocument();
    const firstNameInput = screen.getByRole("textbox", {
      name: "Rename First",
    });
    expect(firstNameInput).toHaveClass("bg-transparent", "border-0", "shadow-none");
    act(() => firstNameInput.focus());
    fireEvent.change(firstNameInput, { target: { value: "  Intro  " } });
    expect(useEditorStore.getState().slideDeck?.slides[0].name).toBe("First");
    fireEvent.keyDown(firstNameInput, { key: "Enter" });
    expect(useEditorStore.getState().slideDeck?.slides[0].name).toBe("Intro");

    expect(screen.queryByRole("button", { name: "Move up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move down" })).not.toBeInTheDocument();
    const reorderCard = screen.getByRole("listitem", {
      name: "Reorder Intro, position 1 of 2",
    });
    fireEvent.keyDown(reorderCard, { key: " " });
    expect(
      screen.getByRole("listitem", {
        name: "Reorder Intro, position 1 of 2, grabbed",
      })
    ).toBeInTheDocument();
    fireEvent.keyDown(reorderCard, { key: "ArrowDown" });

    expect(
      useEditorStore.getState().slideDeck?.slides.map((slide) => slide.name)
    ).toEqual(["Second", "Intro"]);
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-1");
    const movedCard = screen.getByRole("listitem", {
      name: "Reorder Intro, position 2 of 2, grabbed",
    });
    fireEvent.keyDown(movedCard, { key: "Enter" });
    expect(
      screen.getByRole("listitem", {
        name: "Reorder Intro, position 2 of 2",
      })
    ).toBeInTheDocument();
  });

  it("configures only the selected slide and confirms destructive cropping", async () => {
    render(<SlideNavigator />);

    const configureFirst = screen.getByRole("button", {
      name: "Configure slide size for First",
    });
    fireEvent.click(configureFirst);
    expect(useEditorStore.getState().slideDeck?.activeSlideId).toBe("slide-2");
    expect(
      await screen.findByRole("heading", { name: "Slide size" })
    ).toBeInTheDocument();
    const columns = screen.getByRole("spinbutton", { name: "Columns" });
    const rows = screen.getByRole("spinbutton", { name: "Rows" });
    expect(columns).toHaveValue(3);
    expect(rows).toHaveValue(2);

    fireEvent.change(columns, { target: { value: "4" } });
    fireEvent.change(rows, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(useEditorStore.getState().slideDeck?.slides[0].size).toEqual({
      columns: 4,
      rows: 3,
    });
    expect(useEditorStore.getState().slideDeck?.slides[1].size).toEqual({
      columns: 3,
      rows: 2,
    });

    fireEvent.click(configureFirst);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Columns" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Rows" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      await screen.findByRole("heading", { name: "Crop slide content?" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Resize First to 2 × 1. Out-of-bounds cells removed: 1."
    );
    expect(useEditorStore.getState().slideDeck?.slides[0].size).toEqual({
      columns: 4,
      rows: 3,
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useEditorStore.getState().slideDeck?.slides[0].size).toEqual({
      columns: 4,
      rows: 3,
    });
    fireEvent.click(configureFirst);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Columns" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Rows" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    fireEvent.click(screen.getByRole("button", { name: "Crop and apply" }));
    expect(useEditorStore.getState().slideDeck?.slides[0]).toMatchObject({
      size: { columns: 2, rows: 1 },
    });
    expect(useEditorStore.getState().slideDeck?.slides[0]).not.toHaveProperty("grid");
    expect(
      defaultCanvasDocuments
        .getContentReader(useEditorStore.getState().activeCanvasId, "slide-1")
        ?.materialize()
    ).toEqual(new Map());
  });

  it("exits owned fullscreen from the presentation close control", async () => {
    render(
      <ShortcutProvider>
        <ZoomControl containerSize={{ width: 1000, height: 700 }} />
      </ShortcutProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: "Exit presentation" }));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("slide-playback")).not.toBeInTheDocument();
  });
});
