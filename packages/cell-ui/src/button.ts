import type { SurfaceVariant } from "./surface-variant.js";

export type ButtonVariant = "solid" | "outline" | SurfaceVariant;
export type ButtonSize = "sm" | "default" | "lg";

export const resolveButtonVariant = (
  value: unknown,
  fallback: ButtonVariant = "solid",
): ButtonVariant => value === "solid" || value === "surface" || value === "outline" || value === "ghost"
  ? value
  : fallback;

export const resolveButtonSize = (value: unknown): ButtonSize =>
  value === "sm" || value === "lg" ? value : "default";
