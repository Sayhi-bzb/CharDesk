import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CharDeskViewerElement,
  defineCharDeskViewer,
} from "./viewer-element.js";

beforeAll(() => {
  defineCharDeskViewer();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

let canvasContext: CanvasRenderingContext2D;
let renderedFonts: string[];

beforeEach(() => {
  renderedFonts = [];
  let font = "";
  canvasContext = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    get font() { return font; },
    set font(value: string) { font = value; renderedFonts.push(value); },
    fillStyle: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(canvasContext);
});

const mountViewer = (source?: string) => {
  const viewer = document.createElement("chardesk-viewer") as CharDeskViewerElement;
  if (source !== undefined) viewer.source = source;
  document.body.append(viewer);
  return viewer;
};

const getRenderedDocument = (viewer: CharDeskViewerElement) =>
  viewer.shadowRoot?.querySelector("canvas[part~='document']") as HTMLCanvasElement;

const getViewport = (viewer: CharDeskViewerElement) =>
  viewer.shadowRoot?.querySelector("[part='viewport']") as HTMLDivElement;

describe("CharDeskViewerElement", () => {
  it("compiles explicit CharGraph sources before rendering", async () => {
    const viewer = document.createElement("chardesk-viewer") as CharDeskViewerElement;
    viewer.sourceKind = "chargraph";
    viewer.source = "A\n|||\n**B**";
    document.body.append(viewer);

    await vi.waitFor(() => {
      expect(viewer.parsedDocument?.plainText).toBe("A    B");
    });
    expect(viewer.parsedDocument?.cells.find((cell) => cell.text === "B")?.attrs?.bold)
      .toBe(true);
  });

  it("does not apply a stale asynchronous CharGraph render", async () => {
    const viewer = document.createElement("chardesk-viewer") as CharDeskViewerElement;
    viewer.sourceKind = "chargraph";
    document.body.append(viewer);
    viewer.source = "**old**";
    viewer.source = "**new**";

    await vi.waitFor(() => {
      expect(viewer.parsedDocument?.plainText).toBe("new");
    });
  });

  it("upgrades declarative fallback without changing its source", () => {
    const viewer = document.createElement("chardesk-viewer") as CharDeskViewerElement;
    const fallback = document.createElement("pre");
    fallback.dataset.chardeskSource = "";
    fallback.textContent = "┌─┐\n│A│\n└─┘";
    viewer.append(fallback);
    document.body.append(viewer);

    expect(viewer.source).toBe("┌─┐\n│A│\n└─┘");
    expect(getRenderedDocument(viewer).textContent).toBe(viewer.source);
    expect(fallback.textContent).toBe(viewer.source);
    expect(viewer.parsedDocument).toMatchObject({ width: 3, height: 3 });
  });

  it("renders ANSI as presentation while keeping copyable Unicode text", () => {
    const viewer = mountViewer("[31mRED[0m plain");
    const rendered = getRenderedDocument(viewer);

    expect(rendered.textContent).toBe("RED plain");
    expect(viewer.parsedDocument?.cells.slice(0, 3).map((cell) => cell.color))
      .toEqual(["#800000", "#800000", "#800000"]);
    expect(canvasContext.fillText).toHaveBeenCalled();
    expect(viewer.parsedDocument?.source).toBe("[31mRED[0m plain");
  });

  it("treats source HTML as text rather than DOM", () => {
    const viewer = mountViewer('<img src=x onerror="alert(1)">');
    const rendered = getRenderedDocument(viewer);

    expect(rendered.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(rendered.querySelector("img")).toBeNull();
  });

  it("activates only sanitized links through the Canvas hit map", () => {
    const safe =
      "\u001b]8;;https://chardesk.com\u001b\\site\u001b]8;;\u001b\\";
    const unsafe =
      "\u001b]8;;javascript:alert(1)\u001b\\unsafe\u001b]8;;\u001b\\";
    const viewer = mountViewer(`${safe} ${unsafe}`);
    const rendered = getRenderedDocument(viewer);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.spyOn(rendered, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 131,
      height: 51,
      right: 131,
      bottom: 51,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    getViewport(viewer).dispatchEvent(new MouseEvent("click", {
      clientX: 20,
      clientY: 20,
    }));
    getViewport(viewer).dispatchEvent(new MouseEvent("click", {
      clientX: 62,
      clientY: 20,
    }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(rendered.querySelector("a")).toBeNull();
    expect(rendered.textContent).toBe("site unsafe");
  });

  it("copies plain text and exact source independently", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const viewer = mountViewer("[1mBold[0m");

    await viewer.copyPlainText();
    await viewer.copySource();

    expect(writeText).toHaveBeenNthCalledWith(1, "Bold");
    expect(writeText).toHaveBeenNthCalledWith(2, "[1mBold[0m");
  });

  it("clamps manual zoom and disables automatic fitting", () => {
    const viewer = mountViewer("A");
    viewer.zoom = 100;
    expect(viewer.zoom).toBe(4);
    expect(viewer.fit).toBe("none");

    viewer.zoom = 0.01;
    expect(viewer.zoom).toBe(0.25);
    expect(
      (viewer.shadowRoot?.querySelector(".surface") as HTMLDivElement).style
        .transform
    ).toBe("");
    expect(getRenderedDocument(viewer).style.width).toBe("10.25px");
  });

  it("can hide its controls without changing the document", () => {
    const viewer = mountViewer("content");
    viewer.controls = false;

    const toolbar = viewer.shadowRoot?.querySelector("[part='toolbar']");
    expect(toolbar?.hasAttribute("hidden")).toBe(true);
    expect(getRenderedDocument(viewer).textContent).toBe("content");
  });

  it("exposes compact accessible controls through stable parts", () => {
    const viewer = mountViewer("content");
    const toolbar = viewer.shadowRoot?.querySelector(
      "[part='toolbar']"
    ) as HTMLDivElement;
    const controls = [...toolbar.querySelectorAll("button")];

    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Viewer controls");
    expect(controls.map((control) => control.getAttribute("aria-label"))).toEqual([
      "Zoom out",
      "Zoom in",
      "Fit document",
      "Copy plain text",
      "Copy source",
    ]);
    for (const control of controls) {
      expect(control.getAttribute("part")).toContain("control");
      expect(control.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(control.textContent).toBe("");
    }
    expect(viewer.shadowRoot?.querySelector("[part='surface']")).not.toBeNull();
    expect(viewer.shadowRoot?.querySelector("[part='zoom-controls']")).not.toBeNull();
    expect(viewer.shadowRoot?.querySelector("[part='copy-controls']")).not.toBeNull();
    expect(viewer.shadowRoot?.querySelector("[part='zoom-value']")).toBeNull();
    expect(viewer.shadowRoot?.querySelector("[part='coordinate']")).toBeNull();
    expect(viewer.shadowRoot?.querySelector("[part~='copy-selection']")).toBeNull();
  });

  it("keeps visible and programmatic copy actions independent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const viewer = mountViewer("[1mAB[0m");
    viewer.setSelection({ x: 0, y: 0 }, { x: 0, y: 0 });
    const click = (part: string) =>
      (viewer.shadowRoot?.querySelector(`[part~='${part}']`) as HTMLButtonElement)
        .click();

    await viewer.copySelection();
    click("copy-text");
    click("copy-source");
    await Promise.resolve();

    expect(writeText).toHaveBeenNthCalledWith(1, "A");
    expect(writeText).toHaveBeenNthCalledWith(2, "AB");
    expect(writeText).toHaveBeenNthCalledWith(3, "[1mAB[0m");
  });

  it("updates parsing when source or syntax changes", () => {
    const viewer = mountViewer("[31mR[0m");
    viewer.syntax = "plain";
    expect(getRenderedDocument(viewer).textContent).toBe("[31mR[0m");

    viewer.source = "next";
    expect(getRenderedDocument(viewer).textContent).toBe("next");
  });

  it("constrains wide graphemes to the shared Canvas cell grid", () => {
    const viewer = mountViewer("A문🙂B");
    const rendered = getRenderedDocument(viewer);

    expect(rendered.textContent).toBe("A문🙂B");
    expect(viewer.parsedDocument).toMatchObject({ width: 6, height: 1 });
    expect(rendered.style.width).toBe("86px");
    expect(rendered.style.height).toBe("52px");
  });

  it("routes Canvas emoji glyphs to the monochrome font profile", () => {
    const viewer = mountViewer("♥ ♥️ 🇨🇳 1️⃣ 👩🏽‍💻");
    const rendered = getRenderedDocument(viewer);

    expect(renderedFonts.some((font) => font.includes("Noto Emoji"))).toBe(true);
    expect(rendered.getAttribute("part")).toBe("document canvas");
    expect(rendered.textContent).toBe("♥ ♥️ 🇨🇳 1️⃣ 👩🏽‍💻");
  });

  it("fits width using deterministic Canvas document measurements", () => {
    const viewer = mountViewer("x".repeat(40));
    const viewport = getViewport(viewer);
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 196 },
      clientHeight: { configurable: true, value: 300 },
    });

    viewer.fitToViewport("width");

    expect(viewer.zoom).toBe(0.5);
    expect(viewer.fit).toBe("width");
    expect(
      (viewer.shadowRoot?.querySelector(".surface") as HTMLDivElement).style
        .transform
    ).toBe("");
    expect(getRenderedDocument(viewer).style.width).toBe("196px");
    expect(getRenderedDocument(viewer).width).toBe(196);
    expect(
      viewport.style.getPropertyValue("--chardesk-auto-viewport-height")
    ).toBe("26px");
  });

  it("centers a scaled document that is narrower than the viewport", () => {
    const viewer = mountViewer("A");
    const viewport = getViewport(viewer);
    const surface = viewer.shadowRoot?.querySelector(".surface") as HTMLDivElement;
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 400,
    });

    viewer.zoom = 1;

    expect(surface.style.left).toBe("180px");
  });

  it("keeps the viewport height stable during manual zoom", () => {
    const viewer = mountViewer("content");
    const viewport = getViewport(viewer);
    const stage = viewer.shadowRoot?.querySelector("[part='stage']") as HTMLDivElement;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 47.5 },
      clientHeight: { configurable: true, value: 100 },
    });
    viewer.fitToViewport("width");
    const fittedHeight = viewport.style.getPropertyValue(
      "--chardesk-auto-viewport-height"
    );

    viewer.zoom = 1;

    expect(fittedHeight).toBe("26px");
    expect(
      viewport.style.getPropertyValue("--chardesk-auto-viewport-height")
    ).toBe(fittedHeight);
    expect(stage.style.height).toBe("52px");
  });

  it("uses declarative initial zoom when establishing frame height", async () => {
    const viewer = document.createElement(
      "chardesk-viewer"
    ) as CharDeskViewerElement;
    viewer.setAttribute("fit", "none");
    viewer.setAttribute("zoom", "2");
    viewer.source = "content";
    document.body.append(viewer);
    await Promise.resolve();

    expect(
      getViewport(viewer).style.getPropertyValue(
        "--chardesk-auto-viewport-height"
      )
    ).toBe("104px");
  });

  it("exposes observable grid cursor and rectangular selection state", () => {
    const viewer = mountViewer("abc\ndef");
    const cursorEvents = vi.fn();
    const selectionEvents = vi.fn();
    viewer.addEventListener("chardesk-cursor-change", cursorEvents);
    viewer.addEventListener("chardesk-selection-change", selectionEvents);

    viewer.setCursor({ x: 1, y: 0 });
    viewer.setSelection({ x: 1, y: 0 }, { x: 2, y: 1 });

    expect(viewer.cursor).toEqual({ x: 2, y: 1 });
    expect(viewer.selection).toEqual({
      anchor: { x: 1, y: 0 },
      focus: { x: 2, y: 1 },
      rect: { left: 1, top: 0, right: 2, bottom: 1 },
    });
    expect(cursorEvents).toHaveBeenCalledTimes(2);
    expect(selectionEvents).toHaveBeenCalledTimes(1);

    viewer.clearSelection();
    expect(viewer.selection).toBeNull();
    expect(selectionEvents).toHaveBeenCalledTimes(2);
  });

  it("positions cursor and selection directly on the zoomed grid", () => {
    const viewer = mountViewer("abc\ndef");
    viewer.zoom = 2;
    viewer.setSelection({ x: 1, y: 0 }, { x: 2, y: 1 });

    const selection = viewer.shadowRoot?.querySelector(
      "[part='selection']"
    ) as HTMLDivElement;
    const cursor = viewer.shadowRoot?.querySelector(
      "[part='cursor']"
    ) as HTMLDivElement;

    expect(selection.style.cssText).toContain("left: 50px");
    expect(selection.style.cssText).toContain("top: 32px");
    expect(selection.style.cssText).toContain("width: 36px");
    expect(selection.style.cssText).toContain("height: 80px");
    expect(cursor.style.cssText).toContain("left: 68px");
    expect(cursor.style.cssText).toContain("top: 72px");
  });

  it("navigates and extends grid selection with the keyboard", () => {
    const viewer = mountViewer("A界B\n1234");
    const viewport = getViewport(viewer);
    viewer.setCursor({ x: 1, y: 0 });

    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(viewer.cursor).toEqual({ x: 3, y: 0 });

    viewport.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true })
    );
    expect(viewer.selection?.rect).toEqual({
      left: 3,
      top: 0,
      right: 3,
      bottom: 1,
    });
  });

  it("copies a grid selection without replacing native copy methods", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const viewer = mountViewer("A\n  C");
    viewer.setSelection({ x: 0, y: 0 }, { x: 2, y: 1 });

    await viewer.copySelection();

    expect(writeText).toHaveBeenCalledWith("A  \n  C");
  });

  it("clears stale selection and clamps the cursor when source changes", () => {
    const viewer = mountViewer("abcd\nefgh");
    viewer.setSelection({ x: 1, y: 0 }, { x: 3, y: 1 });
    viewer.source = "x";

    expect(viewer.selection).toBeNull();
    expect(viewer.cursor).toEqual({ x: 0, y: 0 });
  });

  it("normalizes legacy text interaction to the single Grid mode", () => {
    const viewer = mountViewer("abc");
    expect(getViewport(viewer).hasAttribute("data-grid-interaction")).toBe(true);
    viewer.setCursor({ x: 1, y: 0 });
    viewer.setAttribute("interaction", "text");

    expect(viewer.interaction).toBe("grid");
    expect(viewer.cursor).toEqual({ x: 1, y: 0 });
    expect(getViewport(viewer).tabIndex).toBe(0);
    expect(getViewport(viewer).hasAttribute("data-grid-interaction")).toBe(true);
  });
});
