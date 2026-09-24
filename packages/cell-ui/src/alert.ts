import type { BadgeTone } from "./badge.js";

export type AlertTone = Exclude<BadgeTone, "neutral">;

export const resolveAlertTone = (value: unknown): AlertTone =>
  value === "success" || value === "warning" || value === "error" ? value : "info";

export const alertGlyph = (tone: AlertTone): string => ({
  info: "i",
  success: "✓",
  warning: "!",
  error: "×",
})[tone];
