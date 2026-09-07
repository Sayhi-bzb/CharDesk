import { DEFAULT_GRID_RENDER_METRICS } from "@/shared/metrics";
import { isIncrementalCanvasSurfaceReader } from "@/domains/canvas/public";
import { GridManager } from "@/shared/utils/grid";
import {
  clampMinimapCameraCenter,
  computeMinimapTransformFromBounds,
  computeMinimapViewportRect,
  lockMinimapPointToAxis,
  minimapPointToWorld,
} from "./geometry";
import type {
  MinimapDimensions,
  MinimapRect,
  MinimapRenderState,
  MinimapTransform,
} from "./types";
import type { Point } from "@/shared/types";

type MinimapColors = {
  background: string;
  foreground: string;
  viewportFill: string;
  viewportStroke: string;
};

type MinimapContentChunk = {
  paths: Map<string, Path2D>;
  bounds: MinimapRect;
};

const MINIMAP_CHUNK_COLUMNS = 128;
const MINIMAP_CHUNK_ROWS = 64;
const MINIMAP_CONTENT_REBUILD_DELAY_MS = 160;
const floorDiv = (value: number, divisor: number) => Math.floor(value / divisor);
const chunkKey = (column: number, row: number) => `${column},${row}`;

export class MinimapManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly dimensions: MinimapDimensions;
  private readonly padding: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver | null;
  private renderState: MinimapRenderState | null = null;
  private transform: MinimapTransform | null = null;
  private viewportRect: MinimapRect | null = null;
  private cachedContentRevision: unknown;
  private cachedReader: MinimapRenderState["reader"] | null = null;
  private hasCachedContent = false;
  private cachedContentBounds: MinimapRect | null = null;
  private lastRenderedViewportKey: string | null = null;
  private cancelScheduledContentRebuild: (() => void) | null = null;
  private cachedForeground = "";
  private contentChunks = new Map<string, MinimapContentChunk>();
  private colors: MinimapColors;

  constructor(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    dimensions: MinimapDimensions,
    padding: number,
    colors: MinimapColors
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Minimap: could not get 2D canvas context");
    this.canvas = canvas;
    this.dimensions = dimensions;
    this.padding = padding;
    this.ctx = ctx;
    this.colors = colors;
    this.observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this.render());
    this.observer?.observe(canvas);
    this.observer?.observe(host);
  }

  close = () => {
    this.observer?.disconnect();
    this.renderState = null;
    this.transform = null;
    this.viewportRect = null;
    this.lastRenderedViewportKey = null;
    this.cancelScheduledContentRebuild?.();
    this.cancelScheduledContentRebuild = null;
    this.contentChunks.clear();
  };

  update = (state: MinimapRenderState) => {
    this.renderState = state;
    this.render();
  };

  setColors = (colors: MinimapColors) => {
    const previousForeground = this.colors.foreground;
    this.colors = colors;
    if (previousForeground !== this.colors.foreground) {
      this.hasCachedContent = false;
    }
    this.render();
  };

  getTransform = () => this.transform;

  getViewportRect = () => this.viewportRect;

  hasContent = () => !!this.transform?.contentBounds;

  getWorldPoint = (
    clientX: number,
    clientY: number,
    options: {
      clampToWorld?: boolean;
      clampToContent?: boolean;
      axisOrigin?: Point;
    } = {}
  ): Point | null => {
    const transform = this.transform;
    if (!transform) return null;
    const rect = this.canvas.getBoundingClientRect();
    let point = minimapPointToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      transform,
      options.clampToWorld
    );
    if (options.clampToContent) {
      point = clampMinimapCameraCenter(
        point,
        transform.contentBounds,
        transform.viewportBounds
      );
    }
    if (options.axisOrigin) {
      point = lockMinimapPointToAxis(point, options.axisOrigin);
    }
    return point;
  };

  private addCellToChunk = (
    chunks: Map<string, MinimapContentChunk>,
    x: number,
    y: number,
    occupancy: number,
    color: string
  ) => {
    const { cellWidth, cellHeight } = DEFAULT_GRID_RENDER_METRICS;
    const column = floorDiv(x, MINIMAP_CHUNK_COLUMNS);
    const row = floorDiv(y, MINIMAP_CHUNK_ROWS);
    const key = chunkKey(column, row);
    const pathRect = {
      x: x * cellWidth,
      y: y * cellHeight,
      width: Math.max(occupancy * cellWidth * 0.9, 1),
      height: Math.max(cellHeight * 0.9, 1),
    };
    const contentRect = {
      x: x * cellWidth,
      y: y * cellHeight,
      width: occupancy * cellWidth,
      height: cellHeight,
    };
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { paths: new Map(), bounds: contentRect };
      chunks.set(key, chunk);
    } else {
      const right = Math.max(
        chunk.bounds.x + chunk.bounds.width,
        contentRect.x + contentRect.width
      );
      const bottom = Math.max(
        chunk.bounds.y + chunk.bounds.height,
        contentRect.y + contentRect.height
      );
      chunk.bounds.x = Math.min(chunk.bounds.x, contentRect.x);
      chunk.bounds.y = Math.min(chunk.bounds.y, contentRect.y);
      chunk.bounds.width = right - chunk.bounds.x;
      chunk.bounds.height = bottom - chunk.bounds.y;
    }
    let path = chunk.paths.get(color);
    if (!path) {
      path = new Path2D();
      chunk.paths.set(color, path);
    }
    path.rect(pathRect.x, pathRect.y, pathRect.width, pathRect.height);
  };

  private rebuildContentBounds = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const chunk of this.contentChunks.values()) {
      minX = Math.min(minX, chunk.bounds.x);
      minY = Math.min(minY, chunk.bounds.y);
      maxX = Math.max(maxX, chunk.bounds.x + chunk.bounds.width);
      maxY = Math.max(maxY, chunk.bounds.y + chunk.bounds.height);
    }
    this.cachedContentBounds = Number.isFinite(minX)
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : null;
  };

  private rebuildChunk = (
    state: MinimapRenderState,
    column: number,
    row: number
  ) => {
    const key = chunkKey(column, row);
    this.contentChunks.delete(key);
    const chunks = new Map<string, MinimapContentChunk>();
    const bounds = {
      x: column * MINIMAP_CHUNK_COLUMNS,
      y: row * MINIMAP_CHUNK_ROWS,
      width: MINIMAP_CHUNK_COLUMNS,
      height: MINIMAP_CHUNK_ROWS,
    };
    for (const surfaceRow of state.reader.rows(bounds)) {
      for (const span of surfaceRow.spans) {
        let x = span.x;
        for (const cell of span.cells) {
          const occupancy = Math.max(GridManager.getCharWidth(cell.char), 1);
          const hasBackground = !!cell.bgColor && cell.bgColor !== "transparent";
          if (hasBackground || (cell.char && cell.char !== " ")) {
            this.addCellToChunk(
              chunks,
              x,
              surfaceRow.y,
              occupancy,
              hasBackground
                ? cell.bgColor!
                : cell.color || this.colors.foreground
            );
          }
          x += occupancy;
        }
      }
    }
    const rebuilt = chunks.get(key);
    if (rebuilt) this.contentChunks.set(key, rebuilt);
  };

  private rebuildPaths = (state: MinimapRenderState) => {
    if (
      this.hasCachedContent &&
      this.cachedReader === state.reader &&
      this.cachedContentRevision === state.contentRevision &&
      this.cachedForeground === this.colors.foreground
    ) {
      return;
    }
    const incrementalReader = isIncrementalCanvasSurfaceReader(state.reader)
      ? state.reader
      : null;
    const canIncrement =
      this.hasCachedContent &&
      this.cachedReader === state.reader &&
      typeof this.cachedContentRevision === "number" &&
      typeof state.contentRevision === "number" &&
      this.cachedForeground === this.colors.foreground &&
      incrementalReader !== null;
    if (canIncrement && incrementalReader) {
      const changes = incrementalReader.getChangesSince(
        this.cachedContentRevision as number
      );
      if (!changes.full) {
        const dirtyChunks = new Set<string>();
        for (const dirty of changes.bounds) {
          const minColumn = floorDiv(dirty.x - 1, MINIMAP_CHUNK_COLUMNS);
          const maxColumn = floorDiv(
            dirty.x + dirty.width,
            MINIMAP_CHUNK_COLUMNS
          );
          const minRow = floorDiv(dirty.y, MINIMAP_CHUNK_ROWS);
          const maxRow = floorDiv(
            dirty.y + dirty.height - 1,
            MINIMAP_CHUNK_ROWS
          );
          for (let row = minRow; row <= maxRow; row += 1) {
            for (let column = minColumn; column <= maxColumn; column += 1) {
              dirtyChunks.add(chunkKey(column, row));
            }
          }
        }
        for (const key of dirtyChunks) {
          const [column, row] = key.split(",").map(Number);
          this.rebuildChunk(state, column!, row!);
        }
        this.rebuildContentBounds();
        this.hasCachedContent = true;
        this.cachedReader = state.reader;
        this.cachedContentRevision = state.contentRevision;
        return;
      }
    }

    this.hasCachedContent = true;
    this.cachedReader = state.reader;
    this.cachedContentRevision = state.contentRevision;
    this.cachedForeground = this.colors.foreground;
    this.cachedContentBounds = null;
    this.contentChunks = new Map();
    const bounds = state.reader.getContentBounds();
    if (!bounds) return;
    for (const row of state.reader.rows(bounds)) {
      for (const span of row.spans) {
        let x = span.x;
        for (const cell of span.cells) {
          const occupancy = Math.max(GridManager.getCharWidth(cell.char), 1);
          const hasBackground = !!cell.bgColor && cell.bgColor !== "transparent";
          if (hasBackground || (cell.char && cell.char !== " ")) {
            const color = hasBackground
              ? cell.bgColor!
              : cell.color || this.colors.foreground;
            this.addCellToChunk(
              this.contentChunks,
              x,
              row.y,
              occupancy,
              color
            );
          }
          x += occupancy;
        }
      }
    }
    this.rebuildContentBounds();
  };

  private scheduleContentRebuild = () => {
    this.cancelScheduledContentRebuild?.();
    this.cancelScheduledContentRebuild = null;
    const rebuild = () => {
      this.cancelScheduledContentRebuild = null;
      const state = this.renderState;
      if (!state) return;
      this.rebuildPaths(state);
      this.render();
    };
    let idleHandle: number | null = null;
    const timeoutHandle = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(rebuild, { timeout: 200 });
      } else {
        rebuild();
      }
    }, MINIMAP_CONTENT_REBUILD_DELAY_MS);
    this.cancelScheduledContentRebuild = () => {
      window.clearTimeout(timeoutHandle);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
    };
  };

  render = () => {
    const state = this.renderState;
    if (!state) return;
    const viewportKey = [
      state.offset.x,
      state.offset.y,
      state.zoom,
      state.viewportSize.width,
      state.viewportSize.height,
    ].join(":");
    const contentChanged =
      this.hasCachedContent &&
      this.cachedContentRevision !== state.contentRevision;
    if (contentChanged) {
      this.scheduleContentRebuild();
      if (this.lastRenderedViewportKey === viewportKey) return;
    }
    else this.rebuildPaths(state);
    const transform = computeMinimapTransformFromBounds({
      ...state,
      contentBounds: this.cachedContentBounds,
      dimensions: this.dimensions,
      padding: this.padding,
    });
    this.transform = transform;
    this.viewportRect = transform
      ? computeMinimapViewportRect(transform)
      : null;

    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.round(this.dimensions.width * dpr);
    const height = Math.round(this.dimensions.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.canvas.style.width = `${this.dimensions.width}px`;
    this.canvas.style.height = `${this.dimensions.height}px`;
    this.lastRenderedViewportKey = viewportKey;

    const { ctx } = this;
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);
    if (!transform) return;

    const { scale, drawableRect, worldBounds } = transform;
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      dpr * scale,
      dpr * (drawableRect.x - worldBounds.x * scale),
      dpr * (drawableRect.y - worldBounds.y * scale)
    );

    for (const chunk of this.contentChunks.values()) {
      for (const [color, path] of chunk.paths) {
        ctx.fillStyle = color;
        ctx.fill(path);
      }
    }

    const viewport = transform.viewportBounds;
    const radius = Math.min(
      viewport.width / 4,
      viewport.height / 4,
      4 / scale
    );
    ctx.beginPath();
    if (radius * scale < 1) {
      ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    } else {
      ctx.roundRect(
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
        radius
      );
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = this.colors.viewportFill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = this.colors.viewportStroke;
    ctx.stroke();
  };
}
