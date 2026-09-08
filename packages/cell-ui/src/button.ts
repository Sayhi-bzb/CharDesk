import type { CellLayoutStyle } from "./types.js";

export type ButtonVariant = "default" | "outline" | "ghost";
export type ButtonSize = "sm" | "default" | "lg";

export const resolveButtonVariant = (value: unknown): ButtonVariant =>
  value === "outline" || value === "ghost" ? value : "default";

export const resolveButtonSize = (value: unknown): ButtonSize =>
  value === "sm" || value === "lg" ? value : "default";

const horizontalPadding: Record<ButtonSize, number> = {
  sm: 0,
  default: 1,
  lg: 2,
};

export const buttonHorizontalPadding = (size: ButtonSize): number =>
  horizontalPadding[size];

export const buttonLayoutDefaults = (size: ButtonSize): CellLayoutStyle => {
  const padding = horizontalPadding[size];
  return {
    direction: "row",
    minHeight: 1,
    flexShrink: 0,
    paddingLeft: padding,
    paddingRight: padding,
  };
};
