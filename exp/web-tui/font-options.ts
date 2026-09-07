import {
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_PROFILE,
  MAPLE_FONT_SOURCES,
} from "@chardesk/font-maple";
import { createCharDeskFontProfile, type CharDeskFontProfile } from "@chardesk/fonts";

export type GalleryFont = "maple" | "ark-prop" | "ark-mono";

export type GalleryFontOption = Readonly<{
  id: GalleryFont;
  label: string;
  profile: CharDeskFontProfile;
  stylesheet?: string;
  fontSpec?: string;
  loadSamples?: readonly string[];
}>;

const createArkProfile = (
  id: Exclude<GalleryFont, "maple">,
  family: string
) => {
  const face = {
    families: {
      regular: `'${family}', ${MAPLE_FONT_FAMILY}`,
      bold: `'${family}', ${MAPLE_FONT_FAMILY}`,
    },
  } as const;
  return createCharDeskFontProfile({
    id: `chardesk/gallery-${id}-maple-v2`,
    display: face,
    cjk: face,
    sources: [
      { id: `${id}-remote`, family, version: "2026.08.11" },
      ...MAPLE_FONT_SOURCES,
    ],
  });
};

export const galleryFontOptions: Record<GalleryFont, GalleryFontOption> = {
  maple: { id: "maple", label: "Maple Mono", profile: MAPLE_FONT_PROFILE },
  "ark-prop": {
    id: "ark-prop",
    label: "Ark Pixel 12px Prop",
    profile: createArkProfile("ark-prop", "Ark Pixel 12px Prop latin"),
    stylesheet: "https://fontsapi.zeoseven.com/925/main/result.css",
    fontSpec: "15px 'Ark Pixel 12px Prop latin'",
    loadSamples: ["AgWi09", "世界，。"],
  },
  "ark-mono": {
    id: "ark-mono",
    label: "Ark Pixel 12px Mono",
    profile: createArkProfile("ark-mono", "Ark Pixel 12px Mono latin"),
    stylesheet: "https://fontsapi.zeoseven.com/925/12px-mono/result.css",
    fontSpec: "15px 'Ark Pixel 12px Mono latin'",
    loadSamples: ["AgWi09", "世界，。"],
  },
};

const galleryFontOrder: readonly GalleryFont[] = ["maple", "ark-prop", "ark-mono"];

export const nextGalleryFont = (font: GalleryFont) =>
  galleryFontOrder[(galleryFontOrder.indexOf(font) + 1) % galleryFontOrder.length]!;
