import {
  drawCharDeskCanvasCursor,
  type CharDeskCanvasPalette,
  type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import {
  resolveCharDeskFontRoute,
  type CharDeskCellMetrics,
} from "@chardesk/rendering";
import { createCellUiRenderFrame } from "./frame.js";
import { resolveCellCursorStyle } from "./cursor-appearance.js";
import type { CellCursorStyle } from "./theme.js";
import type { CellRect, FrameSnapshot } from "./types.js";

type CursorInput = Readonly<{
  frame: FrameSnapshot;
  metrics: CharDeskCellMetrics;
  palette: CharDeskCanvasPalette;
  style: CellCursorStyle;
  fontProfile?: CharDeskFontProfile;
}>;

type CellCursorPresentation = Readonly<{
  bounds: CellRect;
  input: CursorInput;
}>;

type SavedPixels = Readonly<{
  data: ImageData;
  x: number;
  y: number;
}>;

const resolveCellCursorPresentation = (
  input: CursorInput
): CellCursorPresentation | null => {
  const focusedId = input.frame.semantics.focusedId;
  if (!focusedId) return null;
  const node = input.frame.tree.nodes.get(focusedId);
  const layout = input.frame.textLayouts.get(focusedId);
  if (!node?.focusActive || !layout) return null;
  const { caret, contentBounds } = layout;
  if (
    caret.x < contentBounds.x
    || caret.x >= contentBounds.x + contentBounds.width
    || caret.y < contentBounds.y
    || caret.y >= contentBounds.y + contentBounds.height
  ) return null;
  const cell = createCellUiRenderFrame(input.frame).source.get(caret);
  const width = cell && cell.drawText !== false ? cell.visual.width : 1;
  return { input, bounds: { x: caret.x, y: caret.y, width, height: 1 } };
};

const physicalBounds = (
  canvas: HTMLCanvasElement,
  bounds: CellRect,
  metrics: CharDeskCellMetrics
) => {
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const left = Math.max(0, Math.round(bounds.x * metrics.cellWidth * dpr));
  const top = Math.max(0, Math.round(bounds.y * metrics.cellHeight * dpr));
  const right = Math.min(canvas.width, Math.round((bounds.x + bounds.width) * metrics.cellWidth * dpr));
  const bottom = Math.min(canvas.height, Math.round((bounds.y + bounds.height) * metrics.cellHeight * dpr));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const drawCursor = (
  canvas: HTMLCanvasElement,
  presentation: CellCursorPresentation
) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { frame, metrics, palette, fontProfile } = presentation.input;
  const { bounds } = presentation;
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = createCellUiRenderFrame(frame).source.get(bounds);
  const style = resolveCellCursorStyle(frame.buffer.get(bounds.x, bounds.y)?.style, palette, presentation.input.style);
  drawCharDeskCanvasCursor(context, {
    cell: cell?.visual ?? { text: " ", width: 1, fontRoute: resolveCharDeskFontRoute(" ") },
    x: bounds.x * metrics.cellWidth,
    y: bounds.y * metrics.cellHeight,
    style,
    options: {
      metrics,
      palette,
      ...(fontProfile ? { fontProfile } : {}),
    },
    drawText: style.shape === "block" && cell?.drawText !== false,
  });
};

/** Browser-only cursor overlay that preserves the committed Cell frame underneath it. */
export class CellCursorPresenter {
  readonly #canvas: HTMLCanvasElement;
  readonly #media: MediaQueryList | null;
  #presentation: CellCursorPresentation | null = null;
  #saved: SavedPixels | null = null;
  #visible = false;
  #timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    const view = canvas.ownerDocument.defaultView;
    this.#media = view && typeof view.matchMedia === "function"
      ? view.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    this.#media?.addEventListener("change", this.#handleMotionChange);
    canvas.ownerDocument.addEventListener("visibilitychange", this.#handleVisibilityChange);
  }

  beforeBasePresent(): void {
    this.#clearTimer();
    this.#restore();
    this.#presentation = null;
    this.#saved = null;
    this.#visible = false;
  }

  afterBasePresent(input: CursorInput): void {
    this.#presentation = resolveCellCursorPresentation(input);
    if (!this.#presentation) return;
    this.#capture();
    this.#show();
    this.#schedule();
  }

  dispose(): void {
    this.#clearTimer();
    this.#restore();
    this.#media?.removeEventListener("change", this.#handleMotionChange);
    this.#canvas.ownerDocument.removeEventListener("visibilitychange", this.#handleVisibilityChange);
    this.#presentation = null;
    this.#saved = null;
  }

  #capture(): void {
    const presentation = this.#presentation;
    const context = this.#canvas.getContext("2d");
    if (!presentation || !context || typeof context.getImageData !== "function") return;
    const bounds = physicalBounds(this.#canvas, presentation.bounds, presentation.input.metrics);
    if (bounds.width === 0 || bounds.height === 0) return;
    this.#saved = {
      data: context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height),
      x: bounds.x,
      y: bounds.y,
    };
  }

  #restore(): void {
    if (!this.#visible || !this.#saved) return;
    const context = this.#canvas.getContext("2d");
    if (context && typeof context.putImageData === "function") {
      context.putImageData(this.#saved.data, this.#saved.x, this.#saved.y);
    }
    this.#visible = false;
  }

  #show(): void {
    if (this.#visible || !this.#presentation) return;
    drawCursor(this.#canvas, this.#presentation);
    this.#visible = true;
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    globalThis.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    this.#clearTimer();
    const style = this.#presentation?.input.style;
    if (
      !style?.blink
      || this.#media?.matches
      || this.#canvas.ownerDocument.visibilityState === "hidden"
      || !this.#saved
    ) return;
    this.#timer = globalThis.setTimeout(() => {
      this.#timer = null;
      if (this.#visible) this.#restore();
      else this.#show();
      this.#schedule();
    }, Math.max(100, style.blinkIntervalMs));
  }

  readonly #handleMotionChange = () => {
    this.#clearTimer();
    this.#show();
    this.#schedule();
  };

  readonly #handleVisibilityChange = () => {
    this.#clearTimer();
    if (this.#canvas.ownerDocument.visibilityState !== "hidden") {
      this.#show();
      this.#schedule();
    }
  };
}
