import manifest from "../manifest.json";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import {
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_SOURCES,
} from "@chardesk/font-maple";

export const XIAOLAI_FONT_SOURCES = manifest.sources;
export const XIAOLAI_FONT_FAMILY = XIAOLAI_FONT_SOURCES[0]!.family;

export const XIAOLAI_FONT_FACE = {
  families: { regular: `'${XIAOLAI_FONT_FAMILY}', ${MAPLE_FONT_FAMILY}` },
} as const;

export const XIAOLAI_FONT_PROFILE = createCharDeskFontProfile({
  id: "chardesk/gallery-xiaolai-mono-maple-core-v8-3.126",
  display: XIAOLAI_FONT_FACE,
  cjk: XIAOLAI_FONT_FACE,
  sources: [...XIAOLAI_FONT_SOURCES, ...MAPLE_FONT_SOURCES],
});
