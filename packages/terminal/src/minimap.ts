import type { CellRect } from '@chardesk/cell-core';
import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import {
  describeMinimapCell,
  minimapColorKey,
  type MinimapColor,
} from '@chardesk/editor-core/minimap/content';
import {
  computeMinimapTransformFromBounds,
  computeMinimapViewportRect,
  minimapPointToWorld,
  clampMinimapCameraCenter,
  type MinimapTransform,
} from '@chardesk/editor-core/minimap/geometry';

// Terminal rows are approximately twice as tall as columns are wide.
const ROW_ASPECT = 2;
export const minimapPanel = (width: number, height: number): CellRect | null =>
  width >= 60 && height >= 18 ? { x: width - 30, y: height - 13, width: 28, height: 10 } : null;

export type MinimapFrame = {
  panel: CellRect;
  transform: MinimapTransform;
  viewport: CellRect;
  pixels: Uint32Array;
  colors: readonly MinimapColor[];
  hasContent: boolean;
};

export class TerminalMinimap {
  #reader: CanvasSurfaceReader | null = null;
  #revision: unknown;
  #groups = new Map<string, { color: MinimapColor; spans: CellRect[] }>();

  #raster: { key: string; pixels: Uint32Array; colors: MinimapColor[] } | null = null;
  #bounds: CellRect | null = null;

  #updateContent(reader: CanvasSurfaceReader, revision: unknown) {
    if (reader === this.#reader && revision === this.#revision) return;
    this.#reader = reader;
    this.#revision = revision;
    this.#groups = new Map();

    this.#raster = null;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const row of reader.rows()) {
      for (const span of row.spans) {
        let x = span.x;
        let run: { x: number; y: number; width: number; height: number } | null = null;
        let previousColor = '';
        for (const cell of span.cells) {
          const { width, color } = describeMinimapCell(cell);
          if (color) {
            const key = minimapColorKey(color);
            let group = this.#groups.get(key);
            if (!group) {
              group = { color, spans: [] };
              this.#groups.set(key, group);
            }
            if (run && previousColor === key) run.width += width;
            else {
              run = { x, y: row.y * ROW_ASPECT, width, height: ROW_ASPECT };
              group.spans.push(run);
            }
            previousColor = key;
            left = Math.min(left, x);
            top = Math.min(top, row.y * ROW_ASPECT);
            right = Math.max(right, x + width);
            bottom = Math.max(bottom, (row.y + 1) * ROW_ASPECT);
          } else {
            run = null;
            previousColor = '';
          }
          x += width;
        }
      }
    }
    this.#bounds = Number.isFinite(left)
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : null;
  }

  frame(
    reader: CanvasSurfaceReader,
    revision: unknown,
    view: CellRect,
    panel: CellRect,
    foreground: string | null = null
  ): MinimapFrame {
    this.#updateContent(reader, revision);
    const width = panel.width - 2,
      height = panel.height - 2;
    const transform = computeMinimapTransformFromBounds({
      contentBounds: this.#bounds,
      offset: { x: -view.x, y: -view.y * ROW_ASPECT },
      zoom: 1,
      viewportSize: { width: view.width, height: view.height * ROW_ASPECT },
      dimensions: { width, height: height * ROW_ASPECT },
      padding: 0,
    })!;
    const key = JSON.stringify([width, height, transform.worldBounds, transform.scale, foreground]);
    if (this.#raster?.key !== key)
      this.#raster = { key, ...this.#rasterize(transform, width, height, foreground) };
    const { pixels, colors } = this.#raster;
    const box = computeMinimapViewportRect(transform);
    const viewport = {
      x: Math.max(0, Math.min(width - 2, Math.floor(box.x))),
      y: Math.max(0, Math.min(height - 2, Math.floor(box.y / ROW_ASPECT))),
      width: Math.max(2, Math.min(width, Math.ceil(box.width))),
      height: Math.max(2, Math.min(height, Math.ceil(box.height / ROW_ASPECT))),
    };
    viewport.width = Math.min(viewport.width, width - viewport.x);
    viewport.height = Math.min(viewport.height, height - viewport.y);
    return { panel, transform, viewport, pixels, colors, hasContent: this.#bounds !== null };
  }

  #rasterize(
    transform: MinimapTransform,
    width: number,
    height: number,
    foreground: string | null
  ) {
    const pixels = new Uint32Array(width * height),
      best = new Float64Array(pixels.length),
      weights = new Float64Array(pixels.length);
    const colors: MinimapColor[] = [];
    const groups = new Map<string, { color: MinimapColor; sources: CellRect[][] }>();
    for (const group of this.#groups.values()) {
      const key = minimapColorKey(group.color, foreground),
        existing = groups.get(key);
      if (!existing) groups.set(key, { color: group.color, sources: [group.spans] });
      else {
        existing.sources.push(group.spans);
        if (group.color.kind === 'foreground') existing.color = group.color;
      }
    }
    for (const [, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      weights.fill(0);
      for (const spans of group.sources)
        for (const span of spans) {
          const left = (span.x - transform.worldBounds.x) * transform.scale;
          const top = ((span.y - transform.worldBounds.y) * transform.scale) / ROW_ASPECT;
          const w = span.width * transform.scale,
            h = (span.height * transform.scale) / ROW_ASPECT;
          const fromX = Math.max(0, Math.floor(left)),
            fromY = Math.max(0, Math.floor(top));
          const toX = Math.min(width, Math.max(fromX + 1, Math.ceil(left + w)));
          const toY = Math.min(height, Math.max(fromY + 1, Math.ceil(top + h)));
          for (let y = fromY; y < toY; y++) {
            const dy = Math.max(0, Math.min(h, y + 1 - top) - Math.max(0, y - top));
            for (let x = fromX; x < toX; x++) {
              const dx = Math.max(0, Math.min(w, x + 1 - left) - Math.max(0, x - left));
              weights[y * width + x] += dx * dy;
            }
          }
        }
      colors.push(group.color);
      for (let i = 0; i < pixels.length; i++) {
        const weight = weights[i]!;
        // Relative tolerance preserves tiny distant glyphs while fencing float-noise ties.
        if (weight > best[i]! + Math.max(weight, best[i]!) * Number.EPSILON * 32) {
          best[i] = weight;
          pixels[i] = colors.length;
        }
      }
    }
    const usedColors: MinimapColor[] = [],
      indices = new Map<number, number>();
    for (let i = 0; i < pixels.length; i++) {
      const index = pixels[i]!;
      if (!index) continue;
      let compact = indices.get(index);
      if (compact === undefined) {
        usedColors.push(colors[index - 1]!);
        compact = usedColors.length;
        indices.set(index, compact);
      }
      pixels[i] = compact;
    }
    return { pixels, colors: usedColors };
  }

  worldPoint(frame: MinimapFrame, x: number, y: number) {
    return minimapPointToWorld(
      { x: x - frame.panel.x - 0.5, y: (y - frame.panel.y - 0.5) * ROW_ASPECT },
      frame.transform,
      true
    );
  }

  cameraOrigin(frame: MinimapFrame, x: number, y: number, grab: { x: number; y: number }) {
    const point = this.worldPoint(frame, x, y);
    const center = clampMinimapCameraCenter(
      { x: point.x - grab.x, y: point.y - grab.y },
      frame.transform.contentBounds,
      frame.transform.viewportBounds
    );
    return {
      x: Math.round(center.x - frame.transform.viewportBounds.width / 2),
      y: Math.round((center.y - frame.transform.viewportBounds.height / 2) / ROW_ASPECT),
    };
  }
}
