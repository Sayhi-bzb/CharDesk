import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import type { Point } from "@/shared/types";

const LEGACY_GRID_CELL_HEIGHT = 19;

const LEGACY_TO_CURRENT_HEIGHT_RATIO =
  DEFAULT_CANVAS_CELL_METRICS.cellHeight / LEGACY_GRID_CELL_HEIGHT;

export const migrateLegacyGridOffset = (offset: Point): Point =>
  Number.isFinite(offset.y)
    ? { x: offset.x, y: offset.y * LEGACY_TO_CURRENT_HEIGHT_RATIO }
    : { ...offset };

export const migrateLegacyGridViewport = <
  T extends { offset: Point; zoom: number },
>(viewport: T): T => ({
  ...viewport,
  offset: migrateLegacyGridOffset(viewport.offset),
});
