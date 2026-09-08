import {
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_PROFILE,
  MAPLE_FONT_SOURCES,
} from "@chardesk/font-maple";
import { createCharDeskFontProfile, type CharDeskFontProfile } from "@chardesk/fonts";
import { FUSION_FONT_FAMILY, FUSION_FONT_SOURCES } from "@chardesk/font-fusion";
import fusionStylesheet from "@chardesk/font-fusion/fonts.css?url";

export type DisplayFont = "maple" | "fusion-mono" | "xiaolai-mono";

export type DisplayFontOption = Readonly<{
  id: DisplayFont;
  label: string;
  profile: CharDeskFontProfile;
  stylesheet?: string;
  fontSpec?: string;
  loadSamples?: readonly string[];
}>;

const fusionFamily = FUSION_FONT_FAMILY;
const fusionFace = {
  families: { regular: `'${fusionFamily}', ${MAPLE_FONT_FAMILY}` },
} as const;
const fusionProfile = createCharDeskFontProfile({
  id: "chardesk/gallery-fusion-mono-maple-core-v6-2026.09.01",
  display: fusionFace,
  cjk: fusionFace,
  sources: [
    ...FUSION_FONT_SOURCES,
    ...MAPLE_FONT_SOURCES,
  ],
});

const xiaolaiFamily = "Xiaolai Mono";
const xiaolaiFace = {
  families: { regular: `'${xiaolaiFamily}', ${MAPLE_FONT_FAMILY}` },
} as const;
const xiaolaiProfile = createCharDeskFontProfile({
  id: "chardesk/gallery-xiaolai-mono-maple-core-v6-3.126",
  display: xiaolaiFace,
  cjk: xiaolaiFace,
  sources: [
    { id: "xiaolai-mono-local", family: xiaolaiFamily, version: "3.126" },
    ...MAPLE_FONT_SOURCES,
  ],
});

export const displayFontOptions: Record<DisplayFont, DisplayFontOption> = {
  maple: { id: "maple", label: "Maple Mono", profile: MAPLE_FONT_PROFILE,
    fontSpec: "15px 'Maple Mono NF CN'", loadSamples: ["AgWi09", "世界，。"] },
  "fusion-mono": {
    id: "fusion-mono",
    label: "Fusion Pixel 12px Mono",
    profile: fusionProfile,
    stylesheet: fusionStylesheet,
    fontSpec: `15px '${fusionFamily}'`,
    loadSamples: ["AgWi09", "世界，。"],
  },
  "xiaolai-mono": {
    id: "xiaolai-mono",
    label: xiaolaiFamily,
    profile: xiaolaiProfile,
    stylesheet: `${import.meta.env.BASE_URL}fonts/xiaolai-mono/fonts.css`,
    fontSpec: `15px '${xiaolaiFamily}'`,
    loadSamples: ["AgWi09", "世界，。"],
  },
};
