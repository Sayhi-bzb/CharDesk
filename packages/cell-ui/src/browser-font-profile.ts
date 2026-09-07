import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  type CharDeskFontProfile,
} from "@chardesk/fonts";

/** All Surface consumers share this routing: loading, painting, metrics and Probe. */
export function createCellUiFontProfile(
  profile: CharDeskFontProfile = CHARDESK_SYSTEM_FONT_PROFILE,
): CharDeskFontProfile {
  return {
    ...profile,
    id: `${profile.id}/cell-ui-graphics-v1`,
  };
}
