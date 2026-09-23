export const BADGE_TONES = ["neutral", "info", "success", "warning", "error"] as const;

export type BadgeTone = (typeof BADGE_TONES)[number];

export const resolveBadgeTone = (value: unknown): BadgeTone =>
  BADGE_TONES.find((tone) => tone === value) ?? "neutral";
