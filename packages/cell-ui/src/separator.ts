export type SeparatorVariant = "line" | "slash" | "double" | "dots";

export const resolveSeparatorVariant = (value: unknown): SeparatorVariant =>
  value === "slash" || value === "double" || value === "dots" ? value : "line";
