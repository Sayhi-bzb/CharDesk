import { isEmojiGrapheme } from "@chardesk/protocol";
import { NERD_FONT_RANGES } from "./generated/nerd-font-ranges.js";

export const CHARDESK_SYSTEM_FONT_PROFILE_ID = "chardesk/system-v4";

export const CHARDESK_SYSTEM_FONT_FAMILY =
  "ui-monospace, " +
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', " +
  "'Courier New', monospace";

export const CHARDESK_NERD_FONT_FAMILY =
  "'Symbols Nerd Font Mono', ui-monospace, monospace";

export const CHARDESK_SYMBOL_FONT_FAMILY =
  "'JuliaMono', ui-monospace, monospace";

export const CHARDESK_EMOJI_FONT_FAMILY =
  "'Noto Emoji', 'JuliaMono', ui-monospace, monospace";

export type CharDeskFontCapability =
  | "display"
  | "cell-glyph"
  | "cjk"
  | "nerd"
  | "symbol"
  | "emoji";

/** inherit follows Cell bold; regular always requests the regular face/weight. */
export type CharDeskFontWeightPolicy = "inherit" | "regular";

export type CharDeskFontFaceSpec = Readonly<{
  families: Readonly<{
    regular: string;
    bold?: string;
  }>;
  fontSizeScale?: number;
  scaleX?: number;
  baselineShiftEm?: number;
  /** Optional grid calibration, in em of this face's effective font size. */
  cellMetrics?: Readonly<{ width?: number; height?: number; baseline?: number }>;
  weightPolicy?: CharDeskFontWeightPolicy;
}>;

export type CharDeskFontSource = Readonly<{
  id: string;
  family: string;
  version: string;
}>;

export type CharDeskFontProfile = Readonly<{
  id: string;
  capabilities: Readonly<Record<CharDeskFontCapability, CharDeskFontFaceSpec>>;
  sources: readonly CharDeskFontSource[];
  resolveCapability: (grapheme: string) => CharDeskFontCapability;
  /** Compatibility stacks for the original text/emoji renderer routes. */
  families: Readonly<{
    text: string;
    emoji: string;
  }>;
}>;

export type CharDeskDisplayFontProfileInput = Readonly<{
  id: string;
  display: CharDeskFontFaceSpec;
  cjk?: CharDeskFontFaceSpec;
  cellGlyph?: CharDeskFontFaceSpec;
  sources?: readonly CharDeskFontSource[];
}>;

const CJK_SCRIPT = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;
const CJK_COMMON = /[\u2E80-\u303F\u31C0-\u33FF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFFEF]/u;
const CELL_NATIVE_GLYPH = /[\u2500-\u259F]/u;
const SYMBOL = /\p{Symbol}/u;

export const isNerdFontCodePoint = (codePoint: number): boolean =>
  NERD_FONT_RANGES.some((range) => typeof range === "number"
    ? codePoint === range
    : codePoint >= range[0] && codePoint <= range[1]);

export const resolveCharDeskFontCapability = (
  grapheme: string
): CharDeskFontCapability => {
  if (isEmojiGrapheme(grapheme)) return "emoji";
  const codePoint = grapheme.codePointAt(0);
  if (codePoint !== undefined && isNerdFontCodePoint(codePoint)) return "nerd";
  if (CJK_SCRIPT.test(grapheme) || CJK_COMMON.test(grapheme)) return "cjk";
  if (CELL_NATIVE_GLYPH.test(grapheme)) return "cell-glyph";
  if (SYMBOL.test(grapheme)) return "symbol";
  return "display";
};

const systemFace: CharDeskFontFaceSpec = {
  families: {
    regular: CHARDESK_SYSTEM_FONT_FAMILY,
    bold: CHARDESK_SYSTEM_FONT_FAMILY,
  },
};

export const CHARDESK_CORE_CELL_GLYPH_FACE = {
  families: { regular: "'JuliaMono'" },
  weightPolicy: "regular",
} as const satisfies CharDeskFontFaceSpec;

const capabilityFallbacks = (
  display: CharDeskFontFaceSpec,
  cjk: CharDeskFontFaceSpec
) => {
  const displayStack = (weight: "regular" | "bold") => {
    const displayFamily = weight === "bold"
      ? display.families.bold ?? display.families.regular
      : display.families.regular;
    const cjkFamily = weight === "bold"
      ? cjk.families.bold ?? cjk.families.regular
      : cjk.families.regular;
    return [displayFamily, cjkFamily];
  };
  const stack = (...families: string[]) => families
    .filter((family, index, families) => families.indexOf(family) === index)
    .join(", ");
  const coreFirst = (primary: string, weight: "regular" | "bold") =>
    stack(primary, ...displayStack(weight));
  const displayFirst = (fallback: string, weight: "regular" | "bold") =>
    stack(...displayStack(weight), fallback);
  return {
    nerd: {
      families: {
        regular: coreFirst("'Symbols Nerd Font Mono'", "regular"),
        bold: coreFirst("'Symbols Nerd Font Mono'", "bold"),
      },
      scaleX: 0.6,
      weightPolicy: "regular",
    },
    symbol: {
      ...(display.weightPolicy ? { weightPolicy: display.weightPolicy } : {}),
      families: {
        regular: displayFirst("'JuliaMono'", "regular"),
        bold: displayFirst("'JuliaMono'", "bold"),
      },
    },
    emoji: {
      families: {
        regular: coreFirst("'Noto Emoji', 'JuliaMono'", "regular"),
        bold: coreFirst("'Noto Emoji', 'JuliaMono'", "bold"),
      },
      weightPolicy: "regular",
    },
  } as const;
};

export const CHARDESK_CORE_FONT_CAPABILITIES = capabilityFallbacks(systemFace, systemFace) satisfies Pick<
  Record<CharDeskFontCapability, CharDeskFontFaceSpec>,
  "nerd" | "symbol" | "emoji"
>;

export const CHARDESK_CORE_FONT_SOURCES = [
  {
    id: "julia-mono",
    family: "JuliaMono",
    version: "0.63.2",
  },
  {
    id: "noto-emoji",
    family: "Noto Emoji",
    version: "google-fonts-v62",
  },
  {
    id: "symbols-nerd-font-mono",
    family: "Symbols Nerd Font Mono",
    version: "3.5.1",
  },
] as const satisfies readonly CharDeskFontSource[];

export const createCharDeskFontProfile = (
  input: CharDeskDisplayFontProfileInput
): CharDeskFontProfile => {
  const cjk = input.cjk ?? input.display;
  const core = capabilityFallbacks(input.display, cjk);
  return {
    id: input.id,
    families: {
      text: input.display.families.regular,
      emoji: core.emoji.families.regular,
    },
    capabilities: {
      display: input.display,
      "cell-glyph": input.cellGlyph ?? input.display,
      cjk,
      ...core,
    },
    resolveCapability: resolveCharDeskFontCapability,
    sources: [...(input.sources ?? []), ...CHARDESK_CORE_FONT_SOURCES],
  };
};

export const CHARDESK_SYSTEM_FONT_PROFILE = createCharDeskFontProfile({
  id: CHARDESK_SYSTEM_FONT_PROFILE_ID,
  display: systemFace,
});

export type CharDeskFontRoute = keyof CharDeskFontProfile["families"];
