import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";

export const TOOLTIP_HOVER_DELAY_MS = 500;

export const tooltipText = (value: string): string => value.replace(/[\r\n\t]+/gu, " ").trim();

export const tooltipTextWidth = (value: string): number =>
  [...iterateGraphemes(value)].reduce((width, { segment }) => width + getGraphemeCellWidth(segment), 0);

export const fitTooltipText = (value: string, width: number): string => {
  if (width <= 0) return "";
  if (tooltipTextWidth(value) <= width) return value;
  let result = "";
  let used = 0;
  for (const { segment } of iterateGraphemes(value)) {
    const next = getGraphemeCellWidth(segment);
    if (used + next + 1 > width) break;
    result += segment;
    used += next;
  }
  return `${result}…`;
};
