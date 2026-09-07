import type { DisplayFont } from "../../src/shared/fonts/catalog";
export {
  displayFontOptions as galleryFontOptions,
  type DisplayFont as GalleryFont,
} from "../../src/shared/fonts/catalog";

const galleryFontOrder: readonly DisplayFont[] = ["maple", "ark-mono", "xiaolai-mono"];
export const nextGalleryFont = (font: DisplayFont) =>
  galleryFontOrder[(galleryFontOrder.indexOf(font) + 1) % galleryFontOrder.length]!;
