import manifest from "../manifest.json";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import {
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_SOURCES,
} from "@chardesk/font-maple";

export const FUSION_FONT_SOURCES = manifest.sources;
export const FUSION_FONT_FAMILY = FUSION_FONT_SOURCES[0]!.family;

export const FUSION_FONT_FACE = {
  families: { regular: `'${FUSION_FONT_FAMILY}', ${MAPLE_FONT_FAMILY}` },
} as const;

export const FUSION_FONT_PROFILE = createCharDeskFontProfile({
  id: "chardesk/gallery-fusion-mono-maple-core-v7-2026.09.01",
  display: FUSION_FONT_FACE,
  cjk: FUSION_FONT_FACE,
  sources: [...FUSION_FONT_SOURCES, ...MAPLE_FONT_SOURCES],
});
