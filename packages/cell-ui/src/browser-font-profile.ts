import {
  CHARDESK_CORE_CELL_GLYPH_FACE,
  CHARDESK_SYSTEM_FONT_PROFILE,
  resolveCharDeskFontCapability,
  type CharDeskFontProfile,
} from "@chardesk/fonts";

/** All Surface consumers share this routing: loading, painting, metrics and Probe. */
export function createCellUiFontProfile(
  profile: CharDeskFontProfile = CHARDESK_SYSTEM_FONT_PROFILE,
): CharDeskFontProfile {
  return {
    ...profile,
    id: `${profile.id}/cell-ui-core-glyph-v1`,
    capabilities: { ...profile.capabilities, "cell-glyph": CHARDESK_CORE_CELL_GLYPH_FACE },
    resolveCapability: (text) => resolveCharDeskFontCapability(text) === "cell-glyph"
      ? "cell-glyph" : profile.resolveCapability(text),
  };
}
