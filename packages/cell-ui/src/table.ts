import { fitTooltipText, tooltipTextWidth } from "./tooltip.js";

export type TableVariant = "plain" | "outline" | "surface";
export type TableColumn = Readonly<{
  label: string;
  width: number;
  align?: "left" | "right";
}>;

export const resolveTableVariant = (value: unknown): TableVariant =>
  value === "outline" || value === "surface" ? value : "plain";

export const tableWidth = (columns: readonly TableColumn[], variant: TableVariant): number =>
  columns.reduce((width, column) => width + column.width, 0)
  + Math.max(0, columns.length - 1) * (variant === "outline" ? 1 : 2)
  + (variant === "plain" ? 0 : 2);

export const fitTableCell = (value: string, column: TableColumn, variant: TableVariant): string => {
  const inset = variant === "outline" ? 1 : 0;
  const contentWidth = column.width - inset * 2;
  const clipped = fitTooltipText(value.replace(/[\r\n\t]+/gu, " "), contentWidth);
  const remaining = contentWidth - tooltipTextWidth(clipped);
  const content = column.align === "right"
    ? `${" ".repeat(remaining)}${clipped}`
    : `${clipped}${" ".repeat(remaining)}`;
  return `${" ".repeat(inset)}${content}${" ".repeat(inset)}`;
};
