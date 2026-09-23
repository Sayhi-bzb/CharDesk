import type { SurfaceVariant } from "./surface-variant.js";

export type ButtonVariant = "solid" | "outline" | SurfaceVariant;

export const resolveButtonVariant = (
  value: unknown,
  fallback: ButtonVariant = "solid",
): ButtonVariant => value === "solid" || value === "surface" || value === "outline" || value === "ghost"
  ? value
  : fallback;
