import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { resolveCharDeskFontRoute } from "@chardesk/rendering";

export const resolveRenderFontRoute = resolveCharDeskFontRoute;
export const getRenderFontFamily = (
  route: "text" | "emoji"
) => MAPLE_FONT_PROFILE.families[route];
export const getRenderFontFamilyForGrapheme = (grapheme: string) =>
  getRenderFontFamily(resolveRenderFontRoute(grapheme));
export type {
  CharDeskRenderFontRoute as RenderFontRoute,
} from "@chardesk/rendering";
