import { isEmojiGrapheme } from "@chardesk/protocol";

export const CHARDESK_SYSTEM_FONT_PROFILE_ID = "chardesk/system-v1";

export const CHARDESK_SYSTEM_FONT_FAMILY =
  "ui-monospace, " +
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', " +
  "'Courier New', monospace";

export const CHARDESK_NERD_FONT_FAMILY =
  "'Symbols Nerd Font Mono', ui-monospace, monospace";

export const CHARDESK_SYMBOL_FONT_FAMILY =
  "'Noto Sans Symbols 2', ui-monospace, monospace";

export const CHARDESK_EMOJI_FONT_FAMILY =
  "'Noto Emoji', 'Noto Sans Symbols 2', ui-monospace, monospace";

export type CharDeskFontCapability =
  | "display"
  | "cjk"
  | "nerd"
  | "symbol"
  | "emoji";

export type CharDeskFontWeightPolicy = "inherit" | "regular";

export type CharDeskFontFaceSpec = Readonly<{
  families: Readonly<{
    regular: string;
    bold?: string;
  }>;
  fontSizeScale?: number;
  scaleX?: number;
  baselineShiftEm?: number;
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
  sources?: readonly CharDeskFontSource[];
}>;

// Compacted from scripts/data/sources/nerdfonts.json (Nerd Fonts 3.4.0);
// the package test enforces exact catalog parity.
const NERD_FONT_RANGES: readonly (number | readonly [number, number])[] = [
  [0x23fb, 0x23fe], 0x2665, 0x26a1, 0x2b58,
  [0xe000, 0xe00a], [0xe0a0, 0xe0a3], [0xe0b0, 0xe0c8], 0xe0ca,
  [0xe0cc, 0xe0d2], 0xe0d4, [0xe0d6, 0xe0d7], [0xe200, 0xe2a9],
  [0xe300, 0xe3e3], [0xe5fa, 0xe6b7], [0xe700, 0xe8ef],
  [0xea60, 0xea88], [0xea8a, 0xea8c], [0xea8f, 0xeac7], 0xeac9,
  [0xeacc, 0xeafa], [0xeafc, 0xeb09], [0xeb0b, 0xeb4e],
  [0xeb50, 0xec1e], [0xed00, 0xefce], [0xf000, 0xf381],
  [0xf400, 0xf533], [0xf0001, 0xf0387], [0xf0389, 0xf043c],
  [0xf043e, 0xf0508], [0xf050a, 0xf05fb], [0xf05fd, 0xf0764],
  [0xf0767, 0xf08cf], [0xf08d1, 0xf0b38], [0xf0b3a, 0xf0c9d],
  [0xf0ca0, 0xf1087], [0xf1089, 0xf108b], [0xf108d, 0xf1090],
  [0xf1092, 0xf13a5], [0xf13a7, 0xf189f], [0xf18a1, 0xf18ef],
  [0xf18f1, 0xf1af0],
];

const CJK_SCRIPT = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;
const CJK_COMMON = /[\u2E80-\u303F\u31C0-\u33FF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFFEF]/u;
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
  if (SYMBOL.test(grapheme)) return "symbol";
  return "display";
};

const systemFace: CharDeskFontFaceSpec = {
  families: {
    regular: CHARDESK_SYSTEM_FONT_FAMILY,
    bold: CHARDESK_SYSTEM_FONT_FAMILY,
  },
};

const capabilityFallbacks = (
  display: CharDeskFontFaceSpec,
  cjk: CharDeskFontFaceSpec
) => {
  const stack = (primary: string, weight: "regular" | "bold") => {
    const displayFamily = weight === "bold"
      ? display.families.bold ?? display.families.regular
      : display.families.regular;
    const cjkFamily = weight === "bold"
      ? cjk.families.bold ?? cjk.families.regular
      : cjk.families.regular;
    return [primary, displayFamily, cjkFamily]
      .filter((family, index, families) => families.indexOf(family) === index)
      .join(", ");
  };
  return {
    nerd: {
      families: {
        regular: stack("'Symbols Nerd Font Mono'", "regular"),
        bold: stack("'Symbols Nerd Font Mono'", "bold"),
      },
      scaleX: 0.6,
      weightPolicy: "regular",
    },
    symbol: {
      families: {
        regular: stack("'Noto Sans Symbols 2'", "regular"),
        bold: stack("'Noto Sans Symbols 2'", "bold"),
      },
      weightPolicy: "regular",
    },
    emoji: {
      families: {
        regular: stack("'Noto Emoji', 'Noto Sans Symbols 2'", "regular"),
        bold: stack("'Noto Emoji', 'Noto Sans Symbols 2'", "bold"),
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
    id: "noto-sans-symbols-2",
    family: "Noto Sans Symbols 2",
    version: "google-fonts-v25",
  },
  {
    id: "noto-emoji",
    family: "Noto Emoji",
    version: "google-fonts-v62",
  },
  {
    id: "symbols-nerd-font-mono",
    family: "Symbols Nerd Font Mono",
    version: "3.5.0",
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
