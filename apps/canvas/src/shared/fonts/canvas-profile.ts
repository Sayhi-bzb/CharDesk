import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import {
  DEFAULT_CHARDESK_CELL_METRICS,
  type CharDeskCellMetrics,
} from "@chardesk/rendering";

export const DEFAULT_CANVAS_FONT_PROFILE = MAPLE_FONT_PROFILE;

export const DEFAULT_CANVAS_CELL_METRICS = Object.freeze({
  ...DEFAULT_CHARDESK_CELL_METRICS,
  fontFamily: MAPLE_FONT_PROFILE.families.text,
} satisfies CharDeskCellMetrics);
