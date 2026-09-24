export { cellTextWidth as tooltipTextWidth, fitSingleLineText as fitTooltipText } from "./single-line-text.js";

export const TOOLTIP_HOVER_DELAY_MS = 500;

export const tooltipText = (value: string): string => value.replace(/[\r\n\t]+/gu, " ").trim();
