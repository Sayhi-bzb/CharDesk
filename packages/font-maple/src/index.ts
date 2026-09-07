import { createCharDeskFontProfile } from "@chardesk/fonts";

export const MAPLE_FONT_FAMILY =
  "'Maple Mono NF CN', ui-monospace, SFMono-Regular, Menlo, Monaco, " +
  "Consolas, 'Liberation Mono', 'Courier New', monospace";

export const MAPLE_FONT_FACE = {
  families: { regular: MAPLE_FONT_FAMILY, bold: MAPLE_FONT_FAMILY },
} as const;

export const MAPLE_FONT_SOURCES = [
  { id: "maple-mono-nf-cn", family: "Maple Mono NF CN", version: "7.900" },
  { id: "maple-mono-nf-cn-bold", family: "Maple Mono NF CN", version: "7.900" },
] as const;

export const MAPLE_FONT_PROFILE = createCharDeskFontProfile({
  id: "chardesk/maple-v1",
  display: MAPLE_FONT_FACE,
  cjk: MAPLE_FONT_FACE,
  sources: MAPLE_FONT_SOURCES,
});
