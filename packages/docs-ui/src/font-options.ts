import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import type { CharDeskFontProfile } from "@chardesk/fonts";
import { FUSION_FONT_FAMILY, FUSION_FONT_PROFILE } from "@chardesk/font-fusion";
import fusionStylesheet from "@chardesk/font-fusion/fonts.css?url";
import { XIAOLAI_FONT_FAMILY, XIAOLAI_FONT_PROFILE } from "@chardesk/font-xiaolai";
import xiaolaiStylesheet from "@chardesk/font-xiaolai/fonts.css?url";

export type GalleryFont = "maple" | "fusion-mono" | "xiaolai-mono";

type GalleryFontOption = Readonly<{
  id: GalleryFont;
  label: string;
  profile: CharDeskFontProfile;
  stylesheet?: string;
  fontSpec?: string;
  loadSamples?: readonly string[];
}>;

export const galleryFontOptions: Record<GalleryFont, GalleryFontOption> = {
  maple: {
    id: "maple",
    label: "Maple Mono",
    profile: MAPLE_FONT_PROFILE,
    fontSpec: "15px 'Maple Mono NF CN'",
    loadSamples: ["AgWi09", "世界，。"],
  },
  "fusion-mono": {
    id: "fusion-mono",
    label: "Fusion Pixel 12px Mono",
    profile: FUSION_FONT_PROFILE,
    stylesheet: fusionStylesheet,
    fontSpec: `15px '${FUSION_FONT_FAMILY}'`,
    loadSamples: ["AgWi09", "世界，。"],
  },
  "xiaolai-mono": {
    id: "xiaolai-mono",
    label: XIAOLAI_FONT_FAMILY,
    profile: XIAOLAI_FONT_PROFILE,
    stylesheet: xiaolaiStylesheet,
    fontSpec: `15px '${XIAOLAI_FONT_FAMILY}'`,
    loadSamples: ["AgWi09"],
  },
};
