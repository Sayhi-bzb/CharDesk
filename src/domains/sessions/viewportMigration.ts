import { DEFAULT_GRID_GEOMETRY } from "@/shared/metrics/gridGeometry";
import type { Point } from "@/shared/types";

export const LEGACY_GRID_CELL_HEIGHT = 19;

const LEGACY_TO_CURRENT_HEIGHT_RATIO =
  DEFAULT_GRID_GEOMETRY.cellHeight / LEGACY_GRID_CELL_HEIGHT;

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
