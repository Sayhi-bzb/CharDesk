import {
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_PROFILE,
  MAPLE_FONT_SOURCES,
} from "@chardesk/font-maple";
import { createCharDeskFontProfile, type CharDeskFontProfile } from "@chardesk/fonts";
import { ARK_FONT_FAMILY, ARK_FONT_SOURCES } from "@chardesk/font-ark";
import arkStylesheet from "@chardesk/font-ark/fonts.css?url";

export type GalleryFont = "maple" | "ark-mono" | "xiaolai-mono";

export type GalleryFontOption = Readonly<{
  id: GalleryFont;
  label: string;
  profile: CharDeskFontProfile;
  stylesheet?: string;
  fontSpec?: string;
  loadSamples?: readonly string[];
}>;

const arkFamily = ARK_FONT_FAMILY;
const arkFace = {
  families: { regular: `'${arkFamily}', ${MAPLE_FONT_FAMILY}` },
  weightPolicy: "regular",
} as const;
const arkProfile = createCharDeskFontProfile({
  id: "chardesk/gallery-ark-mono-maple-core-v4-2026.09.01",
  display: arkFace,
  cjk: arkFace,
  sources: [
    ...ARK_FONT_SOURCES,
    ...MAPLE_FONT_SOURCES,
  ],
});

const xiaolaiFamily = "Xiaolai Mono";
const xiaolaiFace = {
  families: { regular: `'${xiaolaiFamily}', ${MAPLE_FONT_FAMILY}` },
  weightPolicy: "regular",
} as const;
const xiaolaiProfile = createCharDeskFontProfile({
  id: "chardesk/gallery-xiaolai-mono-maple-core-v4-v1",
  display: xiaolaiFace,
  cjk: xiaolaiFace,
  sources: [
    { id: "xiaolai-mono-local", family: xiaolaiFamily, version: "3.126" },
    ...MAPLE_FONT_SOURCES,
  ],
});

export const galleryFontOptions: Record<GalleryFont, GalleryFontOption> = {
  maple: { id: "maple", label: "Maple Mono", profile: MAPLE_FONT_PROFILE },
  "ark-mono": {
    id: "ark-mono",
    label: "Ark Pixel 12px Mono",
    profile: arkProfile,
    stylesheet: arkStylesheet,
    fontSpec: `15px '${arkFamily}'`,
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

const galleryFontOrder: readonly GalleryFont[] = ["maple", "ark-mono", "xiaolai-mono"];

export const nextGalleryFont = (font: GalleryFont) =>
  galleryFontOrder[(galleryFontOrder.indexOf(font) + 1) % galleryFontOrder.length]!;
