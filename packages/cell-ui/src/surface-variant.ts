export type SurfaceVariant = "surface" | "ghost";

export const resolveSurfaceVariant = (
  value: unknown,
  fallback: SurfaceVariant = "surface",
): SurfaceVariant => value === "surface" || value === "ghost" ? value : fallback;
