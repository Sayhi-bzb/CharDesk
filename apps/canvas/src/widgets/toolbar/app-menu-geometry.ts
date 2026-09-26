import { CELL_SURFACE_GUARD_CELLS, DEFAULT_CELL_UI_METRICS } from '@chardesk/cell-ui/browser';

export const APP_MENU_TRIGGER_GEOMETRY = {
  width: (3 + 2 * CELL_SURFACE_GUARD_CELLS) * DEFAULT_CELL_UI_METRICS.cellWidth,
  height: (1 + 2 * CELL_SURFACE_GUARD_CELLS) * DEFAULT_CELL_UI_METRICS.cellHeight,
  contentLeft: CELL_SURFACE_GUARD_CELLS * DEFAULT_CELL_UI_METRICS.cellWidth,
} as const;
