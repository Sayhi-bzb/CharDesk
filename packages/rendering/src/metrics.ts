import { CHARDESK_SYSTEM_FONT_PROFILE } from "@chardesk/fonts";

export type CharDeskCellMetrics = {
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fontFamily: string;
  /** Alphabetic baseline from the Cell top; omitted preserves middle alignment. */
  baseline?: number;
};

export const DEFAULT_CHARDESK_CELL_METRICS = Object.freeze({
  cellWidth: 9,
  cellHeight: 20,
  baseline: 15,
  fontSize: 15,
  fontFamily: CHARDESK_SYSTEM_FONT_PROFILE.families.text,
} satisfies CharDeskCellMetrics);
