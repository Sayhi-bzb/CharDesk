import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  withCharDeskCoreCellGlyphs,
  type CharDeskFontProfile,
} from "@chardesk/fonts";

/** All Surface consumers share this routing: loading, painting, metrics and Probe. */
export function createCellUiFontProfile(
  profile: CharDeskFontProfile = CHARDESK_SYSTEM_FONT_PROFILE,
): CharDeskFontProfile {
  return {
    ...withCharDeskCoreCellGlyphs(profile),
    id: `${profile.id}/cell-ui-core-glyph-v1`,
  };
}
