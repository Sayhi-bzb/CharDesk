import type {
  CharDeskTextSyntax,
  ParsedCharDeskText,
} from "@chardesk/protocol";
import {
  compileCharDeskText,
  materializeCompiledCharDeskText,
} from "@chardesk/chargraph";
import { createCharDeskMarkdownRenderOptions } from "@chardesk/chargraph/markdown";
import { CHARDESK_LIGHT_RENDER_THEME } from "@chardesk/chargraph/theme";
import { createCharDeskRenderModelFromDocument } from "@chardesk/rendering";
import {
  DEFAULT_CHARDESK_CANVAS_FONT_AVAILABILITY,
  DEFAULT_CHARDESK_CANVAS_METRICS,
  drawCharDeskCanvasDocument,
  loadCharDeskCanvasFonts,
  measureCharDeskCanvasDocument,
  prepareCharDeskCanvasSurface,
  type CharDeskCanvasDocumentLayout,
  type CharDeskCanvasFontAvailability,
} from "@chardesk/rendering/canvas";
import { sanitizeCharDeskHref } from "./link.js";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { calculateCharDeskFitZoom } from "./fit.js";
import {
  createCharDeskViewerIcon,
  type CharDeskViewerIcon,
} from "./icons.js";
import {
  createCharDeskGridIndex,
  createCharDeskGridSelection,
  getCharDeskGridCell,
  getCharDeskGridSelectionText,
  hasCharDeskGrid,
  hitTestCharDeskGridPoint,
  moveCharDeskGridPoint,
  normalizeCharDeskGridPoint,
  type CharDeskGridIndex,
  type CharDeskGridPoint,
  type CharDeskGridSelection,
} from "./grid-interaction.js";
import {
  createCharDeskRenderModel,
  type CharDeskRenderModel,
} from "./render-model.js";

export type CharDeskViewerFit = "none" | "width" | "contain";
export type CharDeskViewerCopyFormat = "plain" | "source" | "selection";
export type CharDeskViewerInteraction = "grid";
export type CharDeskViewerSourceKind = "protocol" | "chargraph";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const SELECTION_DRAG_THRESHOLD = 4;
const DEFAULT_FIT: CharDeskViewerFit = "width";

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

const clampZoom = (value: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

const normalizeFit = (value: string | null): CharDeskViewerFit =>
  value === "none" || value === "contain" || value === "width"
    ? value
    : DEFAULT_FIT;

const normalizeSyntax = (value: string | null): CharDeskTextSyntax =>
  value === "plain" || value === "ansi" || value === "auto"
    ? value
    : "auto";

const styles = `
  :host {
    --chardesk-fit-max-font-size: 20px;
    --chardesk-color: light-dark(#111827, #e5e7eb);
    --chardesk-background: light-dark(#ffffff, #111318);
    --chardesk-border-color: color-mix(in srgb, currentColor 16%, transparent);
    --chardesk-control-color: color-mix(in srgb, var(--chardesk-color) 72%, transparent);
    --chardesk-control-hover-background: color-mix(in srgb, var(--chardesk-color) 10%, transparent);
    --chardesk-control-hover-color: var(--chardesk-color);
    --chardesk-focus-ring: color-mix(in srgb, #2563eb 70%, transparent);
    --chardesk-radius: 8px;
    --chardesk-grid-cursor: color-mix(in srgb, #2563eb 84%, currentColor);
    --chardesk-grid-selection: color-mix(in srgb, #2563eb 24%, transparent);
    display: block;
    min-width: 0;
    color-scheme: light dark;
    container-type: inline-size;
    color: var(--chardesk-color);
  }

  * { box-sizing: border-box; }

  .root {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    border: 1px solid var(--chardesk-border-color);
    border-radius: var(--chardesk-radius);
    background: var(--chardesk-background);
  }

  .toolbar {
    position: absolute;
    z-index: 4;
    inset: 0;
    color: var(--chardesk-control-color);
    font: 12px/1.2 ui-sans-serif, system-ui, sans-serif;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .toolbar[hidden] { display: none; }

  .control-group {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 4px;
    pointer-events: none;
    transition: transform 120ms ease;
  }

  .zoom-controls {
    bottom: 8px;
    left: 8px;
    transform: translateY(4px);
  }

  .copy-controls {
    top: 8px;
    right: 8px;
    transform: translateY(-4px);
  }

  .root:hover .toolbar,
  .root:focus-within .toolbar {
    opacity: 1;
  }

  .root:hover .control-group,
  .root:focus-within .control-group {
    transform: translateY(0);
    pointer-events: auto;
  }

  button {
    display: inline-flex;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--chardesk-radius);
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  button svg { width: 16px; height: 16px; }

  button:hover, button:focus-visible {
    color: var(--chardesk-control-hover-color);
    background: var(--chardesk-control-hover-background);
  }

  button:focus-visible {
    outline: 3px solid var(--chardesk-focus-ring);
    outline-offset: -3px;
  }

  button:disabled { cursor: default; opacity: 0.45; }

  .viewport {
    position: relative;
    overflow: auto;
    max-width: 100%;
    height: var(
      --chardesk-viewport-height,
      var(--chardesk-auto-viewport-height, auto)
    );
    background: var(--chardesk-background);
  }

  .viewport:focus-visible {
    outline: 3px solid var(--chardesk-focus-ring);
    outline-offset: -3px;
  }

  .stage {
    position: relative;
    min-width: 100%;
    min-height: 1px;
  }

  .surface {
    position: absolute;
    inset: 0 auto auto 0;
  }

  .fit-font-measure {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    font-size: var(--chardesk-fit-max-font-size);
    line-height: 1;
  }

  canvas {
    display: block;
    position: relative;
    color: var(--chardesk-color);
    background: var(--chardesk-background);
    cursor: default;
  }

  .interaction-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .grid-cursor, .grid-selection {
    position: absolute;
    display: none;
  }

  .grid-selection { background: var(--chardesk-grid-selection); }
  .grid-cursor {
    box-shadow: inset 0 0 0 1px var(--chardesk-grid-cursor);
    opacity: 0.45;
  }

  .viewport:focus-within .grid-cursor { opacity: 1; }

  .status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

  @media (hover: none), (pointer: coarse) {
    .toolbar {
      opacity: 1;
    }

    .control-group {
      transform: translateY(0);
      pointer-events: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toolbar, .control-group { transition: none; }
  }
`;

const createButton = (
  label: string,
  icon: CharDeskViewerIcon,
  part: string
) => {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("part", `control ${part}`);
  button.append(createCharDeskViewerIcon(icon));
  return button;
};

export class CharDeskViewerElement extends HTMLElementBase {
  static observedAttributes = [
    "aria-label",
    "controls",
    "fit",
    "interaction",
    "source-kind",
    "syntax",
    "zoom",
  ];

  readonly #root: HTMLDivElement;
  readonly #toolbar: HTMLDivElement;
  readonly #viewport: HTMLDivElement;
  readonly #stage: HTMLDivElement;
  readonly #surface: HTMLDivElement;
  readonly #documentElement: HTMLCanvasElement;
  readonly #fitFontMeasure: HTMLSpanElement;
  readonly #cursorElement: HTMLDivElement;
  readonly #selectionElement: HTMLDivElement;
  readonly #status: HTMLSpanElement;
  readonly #resizeObserver: ResizeObserver | null;
  #mutationObserver: MutationObserver | null = null;
  #source = "";
  #hasExplicitSource = false;
  #parsedDocument: ParsedCharDeskText | null = null;
  #renderModel: CharDeskRenderModel | null = null;
  #documentLayout: CharDeskCanvasDocumentLayout = {
    width: 32,
    height: 32,
    padding: 16,
    metrics: DEFAULT_CHARDESK_CANVAS_METRICS,
  };
  #fontAvailability: CharDeskCanvasFontAvailability = {
    ...DEFAULT_CHARDESK_CANVAS_FONT_AVAILABILITY,
    emoji: false,
  };
  #renderVersion = 0;
  #links = new Map<string, string>();
  #gridIndex: CharDeskGridIndex | null = null;
  #cursor: CharDeskGridPoint | null = null;
  #selection: CharDeskGridSelection | null = null;
  #cellWidth = DEFAULT_CHARDESK_CANVAS_METRICS.cellWidth;
  #cellHeight = DEFAULT_CHARDESK_CANVAS_METRICS.cellHeight;
  #selectionPointerId: number | null = null;
  #pointerAnchor: CharDeskGridPoint | null = null;
  #pointerStart: CharDeskGridPoint | null = null;
  #selectionGestureActive = false;
  #suppressClick = false;
  #zoom = 1;
  #fit: CharDeskViewerFit = DEFAULT_FIT;
  #suppressFitLayout = false;
  #statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;

    this.#root = document.createElement("div");
    this.#root.className = "root";
    this.#root.setAttribute("part", "root");

    this.#toolbar = document.createElement("div");
    this.#toolbar.className = "toolbar";
    this.#toolbar.setAttribute("part", "toolbar");
    this.#toolbar.setAttribute("role", "toolbar");
    this.#toolbar.setAttribute("aria-label", "Viewer controls");
    const zoomOut = createButton("Zoom out", "zoom-out", "zoom-out");
    const zoomIn = createButton("Zoom in", "zoom-in", "zoom-in");
    const fit = createButton("Fit document", "fit", "fit");
    const copyText = createButton("Copy plain text", "copy-text", "copy-text");
    const copySource = createButton("Copy source", "copy-source", "copy-source");
    const zoomControls = document.createElement("div");
    zoomControls.className = "control-group zoom-controls";
    zoomControls.setAttribute("part", "zoom-controls");
    zoomControls.append(zoomOut, zoomIn, fit);
    const copyControls = document.createElement("div");
    copyControls.className = "control-group copy-controls";
    copyControls.setAttribute("part", "copy-controls");
    copyControls.append(copyText, copySource);
    this.#toolbar.append(zoomControls, copyControls);

    this.#viewport = document.createElement("div");
    this.#viewport.className = "viewport";
    this.#viewport.setAttribute("part", "viewport");
    this.#viewport.setAttribute("role", "region");
    this.#stage = document.createElement("div");
    this.#stage.className = "stage";
    this.#stage.setAttribute("part", "stage");
    this.#surface = document.createElement("div");
    this.#surface.className = "surface";
    this.#surface.setAttribute("part", "surface");
    this.#documentElement = document.createElement("canvas");
    this.#documentElement.setAttribute("part", "document canvas");
    this.#documentElement.setAttribute("role", "img");
    const interactionLayer = document.createElement("div");
    interactionLayer.className = "interaction-layer";
    interactionLayer.setAttribute("part", "interaction-layer");
    this.#selectionElement = document.createElement("div");
    this.#selectionElement.className = "grid-selection";
    this.#selectionElement.setAttribute("part", "selection");
    this.#cursorElement = document.createElement("div");
    this.#cursorElement.className = "grid-cursor";
    this.#cursorElement.setAttribute("part", "cursor");
    interactionLayer.append(
      this.#selectionElement,
      this.#cursorElement
    );
    this.#surface.append(this.#documentElement, interactionLayer);
    this.#fitFontMeasure = document.createElement("span");
    this.#fitFontMeasure.className = "fit-font-measure";
    this.#fitFontMeasure.textContent = "M";
    this.#stage.append(this.#surface, this.#fitFontMeasure);
    this.#viewport.append(this.#stage);

    this.#status = document.createElement("span");
    this.#status.className = "status";
    this.#status.setAttribute("role", "status");
    this.#status.setAttribute("aria-live", "polite");
    this.#root.append(this.#toolbar, this.#viewport, this.#status);
    shadow.append(style, this.#root);

    zoomOut.addEventListener("click", () => this.#setManualZoom(this.#zoom - ZOOM_STEP));
    zoomIn.addEventListener("click", () => this.#setManualZoom(this.#zoom + ZOOM_STEP));
    fit.addEventListener("click", () => this.fitToViewport());
    copyText.addEventListener("click", () => void this.copyPlainText());
    copySource.addEventListener("click", () => void this.copySource());
    this.#viewport.addEventListener("pointerdown", this.#handlePointerDown);
    this.#viewport.addEventListener("pointermove", this.#handlePointerMove);
    this.#viewport.addEventListener("pointerup", this.#handlePointerUp);
    this.#viewport.addEventListener("pointercancel", this.#handlePointerUp);
    this.#viewport.addEventListener("click", this.#handleClick);
    this.#viewport.addEventListener("keydown", this.#handleKeyDown);

    this.#resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (this.#fit !== "none") this.fitToViewport(this.#fit);
            else this.#updateStageSize();
          });
  }

  connectedCallback() {
    this.#fit = normalizeFit(this.getAttribute("fit"));
    const attributeZoom = Number(this.getAttribute("zoom"));
    if (Number.isFinite(attributeZoom) && attributeZoom > 0) {
      this.#zoom = clampZoom(attributeZoom);
    }
    if (!this.#hasExplicitSource) this.#source = this.#readFallbackSource();
    this.#syncAttributes();
    this.#render();
    this.#resizeObserver?.observe(this.#viewport);
    this.#mutationObserver = new MutationObserver(() => {
      if (this.#hasExplicitSource) return;
      const source = this.#readFallbackSource();
      if (source === this.#source) return;
      this.#source = source;
      this.#render();
    });
    this.#mutationObserver.observe(this, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    void document.fonts?.ready.then(() => {
      this.#drawDocument();
      this.#scheduleLayout();
    });
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    if (this.#statusTimer) clearTimeout(this.#statusTimer);
  }

  attributeChangedCallback(name: string) {
    if (!this.shadowRoot) return;
    if (name === "syntax" || name === "source-kind") this.#render();
    if (name === "fit") {
      this.#fit = normalizeFit(this.getAttribute("fit"));
      if (!this.#suppressFitLayout) this.#scheduleLayout();
    }
    if (name === "zoom") {
      const value = Number(this.getAttribute("zoom"));
      if (Number.isFinite(value) && value > 0) this.#applyZoom(value);
    }
    this.#syncAttributes();
  }

  get source() {
    return this.#source;
  }

  set source(value: string) {
    this.#hasExplicitSource = true;
    this.#source = String(value);
    this.#render();
  }

  get syntax(): CharDeskTextSyntax {
    return normalizeSyntax(this.getAttribute("syntax"));
  }

  set syntax(value: CharDeskTextSyntax) {
    this.setAttribute("syntax", value);
  }

  get sourceKind(): CharDeskViewerSourceKind {
    return this.getAttribute("source-kind") === "chargraph"
      ? "chargraph"
      : "protocol";
  }

  set sourceKind(value: CharDeskViewerSourceKind) {
    this.setAttribute("source-kind", value);
  }

  get controls() {
    return this.getAttribute("controls") !== "false";
  }

  set controls(value: boolean) {
    this.setAttribute("controls", value ? "true" : "false");
  }

  get interaction(): CharDeskViewerInteraction {
    return "grid";
  }

  set interaction(_value: CharDeskViewerInteraction) {
    this.setAttribute("interaction", "grid");
  }

  get fit(): CharDeskViewerFit {
    return this.#fit;
  }

  set fit(value: CharDeskViewerFit) {
    this.setAttribute("fit", normalizeFit(value));
  }

  get zoom() {
    return this.#zoom;
  }

  set zoom(value: number) {
    this.#setManualZoom(value);
  }

  get parsedDocument(): ParsedCharDeskText | null {
    return this.#parsedDocument;
  }

  get cursor(): CharDeskGridPoint | null {
    return this.#cursor ? { ...this.#cursor } : null;
  }

  get selection(): CharDeskGridSelection | null {
    return this.#selection
      ? {
          anchor: { ...this.#selection.anchor },
          focus: { ...this.#selection.focus },
          rect: { ...this.#selection.rect },
        }
      : null;
  }

  setCursor(point: CharDeskGridPoint | null) {
    const next = point && this.#gridIndex
      ? normalizeCharDeskGridPoint(this.#gridIndex, point)
      : null;
    if (next?.x === this.#cursor?.x && next?.y === this.#cursor?.y) return;
    this.#cursor = next;
    this.#updateGridOverlay();
    this.#emitCursorChange();
  }

  setSelection(anchor: CharDeskGridPoint, focus: CharDeskGridPoint) {
    const next = this.#gridIndex
      ? createCharDeskGridSelection(this.#gridIndex, anchor, focus)
      : null;
    this.#selection = next;
    if (next) this.setCursor(next.focus);
    this.#updateGridOverlay();
    this.#emitSelectionChange();
  }

  clearSelection() {
    if (!this.#selection) return;
    this.#selection = null;
    this.#updateGridOverlay();
    this.#emitSelectionChange();
  }

  resetZoom() {
    this.#setManualZoom(1);
  }

  fitToViewport(mode: CharDeskViewerFit = this.#fit === "none" ? "width" : this.#fit) {
    const fitMode = mode === "contain" ? "contain" : "width";
    const naturalWidth = this.#documentLayout.width;
    const naturalHeight = this.#documentLayout.height;
    const availableWidth = this.#viewport.clientWidth;
    const availableHeight = this.#viewport.clientHeight;
    if (naturalWidth <= 0 || availableWidth <= 0) return;
    const baseFontSize = this.#documentLayout.metrics.fontSize;
    const maxFontSize = Number.parseFloat(
      getComputedStyle(this.#fitFontMeasure).fontSize
    );
    const nextZoom = calculateCharDeskFitZoom({
      mode: fitMode,
      naturalWidth,
      naturalHeight,
      availableWidth,
      availableHeight,
      baseFontSize: Number.isFinite(baseFontSize) ? baseFontSize : 15,
      maxFontSize: Number.isFinite(maxFontSize) ? maxFontSize : 20,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    this.#fit = fitMode;
    if (this.getAttribute("fit") !== fitMode) this.setAttribute("fit", fitMode);
    this.#applyZoom(nextZoom);
    this.#syncViewportHeight();
  }

  copyPlainText() {
    return this.#copy(this.#parsedDocument?.plainText ?? "", "plain");
  }

  copySource() {
    return this.#copy(this.#source, "source");
  }

  copySelection() {
    if (!this.#gridIndex || !this.#selection) return Promise.resolve();
    return this.#copy(
      getCharDeskGridSelectionText(this.#gridIndex, this.#selection),
      "selection"
    );
  }

  #readFallbackSource() {
    const fallback = this.querySelector("pre[data-chardesk-source], pre");
    return fallback?.textContent ?? this.textContent ?? "";
  }

  #render() {
    const renderVersion = ++this.#renderVersion;
    if (this.sourceKind === "chargraph") {
      void compileCharDeskText(this.#source, {
        sourceKind: "chargraph",
        markdown: createCharDeskMarkdownRenderOptions({
          theme: CHARDESK_LIGHT_RENDER_THEME,
        }),
      }).then((compiled) => {
        if (renderVersion !== this.#renderVersion) return;
        this.#applyRenderModel(
          createCharDeskRenderModelFromDocument(
            materializeCompiledCharDeskText(compiled)
          ),
          renderVersion
        );
      }).catch((error: unknown) => {
        if (renderVersion !== this.#renderVersion) return;
        this.#announce("Render failed");
        this.dispatchEvent(new CustomEvent("chardesk-render-error", {
          detail: { error },
        }));
      });
      return;
    }
    this.#applyRenderModel(createCharDeskRenderModel(this.#source, {
      syntax: this.syntax,
    }), renderVersion);
  }

  #applyRenderModel(model: CharDeskRenderModel, renderVersion: number) {
    this.#renderModel = model;
    this.#parsedDocument = model.document;
    this.#gridIndex = createCharDeskGridIndex(model.document);
    this.#documentLayout = measureCharDeskCanvasDocument(model);
    this.#links = new Map(
      model.cells.flatMap((cell) => {
        const href = cell.href ? sanitizeCharDeskHref(cell.href) : null;
        return href ? [[`${cell.x},${cell.y}`, href] as const] : [];
      })
    );
    if (this.#selection) {
      this.#selection = null;
      this.#emitSelectionChange();
    }
    if (this.#cursor) {
      const previous = this.#cursor;
      const next = normalizeCharDeskGridPoint(this.#gridIndex, this.#cursor);
      this.#cursor = next;
      if (next?.x !== previous.x || next?.y !== previous.y) {
        this.#emitCursorChange();
      }
    }
    this.#documentElement.textContent = model.document.plainText;
    this.#documentElement.dataset.width = String(model.document.width);
    this.#documentElement.dataset.height = String(model.document.height);
    this.#documentElement.dataset.diagnostics = String(
      model.document.diagnostics.length
    );
    this.#fontAvailability = { text: true, emoji: false };
    this.#drawDocument();
    this.#scheduleLayout();
    void loadCharDeskCanvasFonts(model.cells.map((cell) => ({
      grapheme: cell.text,
      bold: !!cell.attrs?.bold,
      italic: !!cell.attrs?.italic,
    })), { fontProfile: MAPLE_FONT_PROFILE }).then((availability) => {
      if (renderVersion !== this.#renderVersion) return;
      this.#fontAvailability = availability;
      this.#documentElement.toggleAttribute(
        "data-emoji-font-missing",
        !availability.emoji && model.cells.some((cell) => cell.fontRoute === "emoji")
      );
      this.#drawDocument();
    });
  }

  #drawDocument() {
    const model = this.#renderModel;
    if (!model) return;
    const ctx = this.#documentElement.getContext("2d");
    if (!ctx) return;
    const computed = getComputedStyle(this.#documentElement);
    const color = computed.color || "#111827";
    const background = computed.backgroundColor || "#ffffff";
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const renderLayout = measureCharDeskCanvasDocument(model, {
      zoom: this.#zoom,
    });
    prepareCharDeskCanvasSurface(
      this.#documentElement,
      ctx,
      renderLayout.width,
      renderLayout.height,
      dpr
    );
    drawCharDeskCanvasDocument(ctx, model, {
      palette: { color, background },
      fontAvailability: this.#fontAvailability,
      zoom: this.#zoom,
      fontProfile: MAPLE_FONT_PROFILE,
    });
  }

  #scheduleLayout() {
    queueMicrotask(() => {
      if (!this.isConnected) return;
      if (this.#fit === "none") {
        this.#updateStageSize();
        this.#syncViewportHeight();
      } else {
        this.fitToViewport(this.#fit);
      }
      this.#updateGridOverlay();
    });
  }

  #setManualZoom(value: number) {
    this.#fit = "none";
    if (this.getAttribute("fit") !== "none") {
      this.#suppressFitLayout = true;
      this.setAttribute("fit", "none");
      this.#suppressFitLayout = false;
    }
    this.#applyZoom(value);
  }

  #applyZoom(value: number) {
    const next = clampZoom(value);
    if (!Number.isFinite(next)) return;
    const changed = next !== this.#zoom;
    this.#zoom = next;
    if (changed) this.#drawDocument();
    this.#updateStageSize();
    this.#updateGridOverlay();
    if (changed) {
      this.dispatchEvent(
        new CustomEvent("chardesk-zoom-change", {
          detail: { zoom: next, fit: this.#fit },
        })
      );
    }
  }

  #updateStageSize() {
    this.#stage.style.width = `${this.#documentLayout.width * this.#zoom}px`;
    this.#stage.style.height = `${this.#documentLayout.height * this.#zoom}px`;
    this.#updateSurfaceAlignment();
  }

  #updateSurfaceAlignment() {
    const scaledWidth = this.#documentLayout.width * this.#zoom;
    const availableWidth = this.#viewport.clientWidth;
    const rawOffset = Math.max(0, (availableWidth - scaledWidth) / 2);
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const offset = Math.round(rawOffset * dpr) / dpr;
    this.#surface.style.left = `${offset}px`;
  }

  #syncViewportHeight() {
    const height = this.#documentLayout.height * this.#zoom;
    if (height <= 0 || !Number.isFinite(height)) return;
    this.#viewport.style.setProperty(
      "--chardesk-auto-viewport-height",
      `${height}px`
    );
  }

  #syncAttributes() {
    this.#toolbar.hidden = !this.controls;
    const label = this.getAttribute("aria-label") ?? "CharDesk document";
    this.#viewport.setAttribute("aria-label", label);
    this.#documentElement.setAttribute("aria-label", label);
    this.#viewport.tabIndex = 0;
    this.#viewport.setAttribute("data-grid-interaction", "");
    this.#updateGridOverlay();
  }

  #resolvePointerPoint(
    clientX: number,
    clientY: number,
    boundary: "strict" | "clamp" = "strict"
  ) {
    if (!this.#gridIndex || !hasCharDeskGrid(this.#gridIndex)) return null;
    const rect = this.#documentElement.getBoundingClientRect();
    const paddingLeft = this.#documentLayout.padding;
    const paddingTop = this.#documentLayout.padding;
    const point = {
      x: Math.floor(((clientX - rect.left) / this.#zoom - paddingLeft) / this.#cellWidth),
      y: Math.floor(((clientY - rect.top) / this.#zoom - paddingTop) / this.#cellHeight),
    };
    return boundary === "clamp"
      ? normalizeCharDeskGridPoint(this.#gridIndex, point)
      : hitTestCharDeskGridPoint(this.#gridIndex, point);
  }

  #getLink(point: CharDeskGridPoint) {
    if (!this.#gridIndex) return null;
    const cell = getCharDeskGridCell(this.#gridIndex, point);
    return cell ? this.#links.get(`${cell.x},${cell.y}`) ?? null : null;
  }

  #openLink(href: string, newWindow: boolean) {
    const anchor = document.createElement("a");
    anchor.href = href;
    if (newWindow) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    anchor.click();
  }

  #resetPointerGesture() {
    if (
      this.#selectionPointerId !== null &&
      this.#viewport.hasPointerCapture?.(this.#selectionPointerId)
    ) {
      this.#viewport.releasePointerCapture(this.#selectionPointerId);
    }
    this.#selectionPointerId = null;
    this.#pointerAnchor = null;
    this.#pointerStart = null;
    this.#selectionGestureActive = false;
  }

  #handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const point = this.#resolvePointerPoint(event.clientX, event.clientY);
    if (!point) return;
    if (this.#getLink(point)) return;
    event.preventDefault();
    this.#viewport.focus({ preventScroll: true });
    this.#selectionPointerId = event.pointerId;
    this.#pointerAnchor = point;
    this.#pointerStart = { x: event.clientX, y: event.clientY };
    this.#selectionGestureActive = false;
    this.#suppressClick = false;
    this.#viewport.setPointerCapture?.(event.pointerId);
  };

  #handlePointerMove = (event: PointerEvent) => {
    if (this.#selectionPointerId === null) {
      const point = this.#resolvePointerPoint(event.clientX, event.clientY);
      this.#documentElement.style.cursor = point && this.#getLink(point)
        ? "pointer"
        : "default";
    }
    if (
      this.#selectionPointerId !== event.pointerId ||
      !this.#pointerAnchor ||
      !this.#pointerStart
    ) {
      return;
    }
    if (!this.#selectionGestureActive) {
      const distance = Math.hypot(
        event.clientX - this.#pointerStart.x,
        event.clientY - this.#pointerStart.y
      );
      if (distance < SELECTION_DRAG_THRESHOLD) return;
      this.#selectionGestureActive = true;
    }
    const point = this.#resolvePointerPoint(
      event.clientX,
      event.clientY,
      "clamp"
    );
    if (!point) return;
    event.preventDefault();
    this.setSelection(this.#pointerAnchor, point);
  };

  #handlePointerUp = (event: PointerEvent) => {
    if (this.#selectionPointerId !== event.pointerId) return;
    const completedSelection =
      event.type !== "pointercancel" && this.#selectionGestureActive;
    this.#resetPointerGesture();
    this.#suppressClick = completedSelection;
  };

  #handleClick = (event: MouseEvent) => {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      event.preventDefault();
      return;
    }
    const point = this.#resolvePointerPoint(event.clientX, event.clientY);
    if (!point) return;
    const href = this.#getLink(point);
    if (href) {
      this.#openLink(href, event.metaKey || event.ctrlKey);
      return;
    }
    this.#viewport.focus({ preventScroll: true });
    this.clearSelection();
    this.setCursor(point);
  };

  #handleKeyDown = (event: KeyboardEvent) => {
    if (!this.#gridIndex) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      if (!this.#selection) return;
      event.preventDefault();
      void this.copySelection();
      return;
    }
    if (event.key === "Escape") {
      if (!this.#selection) return;
      event.preventDefault();
      this.clearSelection();
      return;
    }
    if (event.key === "Enter" && this.#cursor) {
      const href = this.#getLink(this.#cursor);
      if (!href) return;
      event.preventDefault();
      this.#openLink(href, event.metaKey || event.ctrlKey);
      return;
    }

    const deltas: Record<string, CharDeskGridPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = this.#cursor ?? normalizeCharDeskGridPoint(this.#gridIndex, {
      x: 0,
      y: 0,
    });
    if (!current) return;
    const next = moveCharDeskGridPoint(this.#gridIndex, current, delta);
    if (!next) return;
    if (event.shiftKey) {
      this.setSelection(this.#selection?.anchor ?? current, next);
    } else {
      this.clearSelection();
      this.setCursor(next);
    }
    queueMicrotask(() => {
      this.#cursorElement.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  };

  #positionGridElement(
    element: HTMLDivElement,
    rect: { left: number; top: number; right: number; bottom: number } | null
  ) {
    if (!rect || this.#cellWidth <= 0 || this.#cellHeight <= 0) {
      element.style.display = "none";
      return;
    }
    const paddingLeft = this.#documentLayout.padding;
    const paddingTop = this.#documentLayout.padding;
    const zoom = this.#zoom;
    element.style.display = "block";
    element.style.left = `${(paddingLeft + rect.left * this.#cellWidth) * zoom}px`;
    element.style.top = `${(paddingTop + rect.top * this.#cellHeight) * zoom}px`;
    element.style.width = `${(rect.right - rect.left + 1) * this.#cellWidth * zoom}px`;
    element.style.height = `${(rect.bottom - rect.top + 1) * this.#cellHeight * zoom}px`;
  }

  #updateGridOverlay() {
    const enabled = !!this.#gridIndex;
    const cursorCell = enabled && this.#cursor && this.#gridIndex
      ? getCharDeskGridCell(this.#gridIndex, this.#cursor)
      : null;
    const cursorRect = enabled && this.#cursor
      ? {
          left: this.#cursor.x,
          top: this.#cursor.y,
          right: this.#cursor.x + (cursorCell?.width ?? 1) - 1,
          bottom: this.#cursor.y,
        }
      : null;
    this.#positionGridElement(this.#selectionElement, enabled ? this.#selection?.rect ?? null : null);
    this.#positionGridElement(this.#cursorElement, cursorRect);
  }

  #emitSelectionChange() {
    this.dispatchEvent(
      new CustomEvent("chardesk-selection-change", {
        detail: { selection: this.selection },
      })
    );
  }

  #emitCursorChange() {
    this.dispatchEvent(
      new CustomEvent("chardesk-cursor-change", {
        detail: { cursor: this.cursor },
      })
    );
  }

  async #copy(text: string, format: CharDeskViewerCopyFormat) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard API is unavailable.");
      }
      this.#announce("Copied");
      this.dispatchEvent(
        new CustomEvent("chardesk-copy", { detail: { format } })
      );
    } catch (error) {
      this.#announce("Copy failed");
      this.dispatchEvent(
        new CustomEvent("chardesk-copy-error", {
          detail: { error, format },
        })
      );
      throw error;
    }
  }

  #announce(message: string) {
    this.#status.textContent = message;
    if (this.#statusTimer) clearTimeout(this.#statusTimer);
    this.#statusTimer = setTimeout(() => {
      this.#status.textContent = "";
      this.#statusTimer = null;
    }, 1200);
  }
}

export const defineCharDeskViewer = () => {
  if (typeof customElements === "undefined") return CharDeskViewerElement;
  if (!customElements.get("chardesk-viewer")) {
    customElements.define("chardesk-viewer", CharDeskViewerElement);
  }
  return CharDeskViewerElement;
};
