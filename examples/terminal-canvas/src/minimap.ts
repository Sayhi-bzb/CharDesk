import type { CellRect } from '@chardesk/cell-core';
import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import { getGraphemeCellWidth } from '@chardesk/protocol';
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
  pixels: Uint8Array;
  hasContent: boolean;
};

export class TerminalMinimap {
  #reader: CanvasSurfaceReader | null = null;
  #revision: unknown;
  #spans: CellRect[] = [];
  #bounds: CellRect | null = null;

  #updateContent(reader: CanvasSurfaceReader, revision: unknown) {
    if (reader === this.#reader && revision === this.#revision) return;
    this.#reader = reader;
    this.#revision = revision;
    this.#spans = [];
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const row of reader.rows()) {
      for (const span of row.spans) {
        let x = span.x;
        let run: { x: number; y: number; width: number; height: number } | null = null;
        for (const cell of span.cells) {
          const width = Math.max(1, getGraphemeCellWidth(cell.char));
          if (
            (cell.char && cell.char !== ' ') ||
            (cell.bgColor && cell.bgColor !== 'transparent')
          ) {
            if (run) run.width += width;
            else {
              run = { x, y: row.y * ROW_ASPECT, width, height: ROW_ASPECT };
              this.#spans.push(run);
            }
            left = Math.min(left, x);
            top = Math.min(top, row.y * ROW_ASPECT);
            right = Math.max(right, x + width);
            bottom = Math.max(bottom, (row.y + 1) * ROW_ASPECT);
          } else run = null;
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
    panel: CellRect
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
    const project = (rect: CellRect) => {
      const x = Math.max(
        0,
        Math.min(width - 1, Math.floor((rect.x - transform.worldBounds.x) * transform.scale))
      );
      const y = Math.max(
        0,
        Math.min(
          height - 1,
          Math.floor(((rect.y - transform.worldBounds.y) * transform.scale) / ROW_ASPECT)
        )
      );
      return {
        x,
        y,
        width: Math.max(
          1,
          Math.min(
            width - x,
            Math.ceil((rect.x + rect.width - transform.worldBounds.x) * transform.scale) - x
          )
        ),
        height: Math.max(
          1,
          Math.min(
            height - y,
            Math.ceil(
              ((rect.y + rect.height - transform.worldBounds.y) * transform.scale) / ROW_ASPECT
            ) - y
          )
        ),
      };
    };
    const pixels = new Uint8Array(width * height);
    for (const span of this.#spans) {
      const rect = project(span);
      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) pixels[y * width + x] = 1;
    }
    const box = computeMinimapViewportRect(transform);
    const viewport = {
      x: Math.max(0, Math.min(width - 2, Math.floor(box.x))),
      y: Math.max(0, Math.min(height - 2, Math.floor(box.y / ROW_ASPECT))),
      width: Math.max(2, Math.min(width, Math.ceil(box.width))),
      height: Math.max(2, Math.min(height, Math.ceil(box.height / ROW_ASPECT))),
    };
    viewport.width = Math.min(viewport.width, width - viewport.x);
    viewport.height = Math.min(viewport.height, height - viewport.y);
    return { panel, transform, viewport, pixels, hasContent: this.#bounds !== null };
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
