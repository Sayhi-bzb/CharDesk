import { customGlyphDefinitions } from "./cell-graphics-upstream.js";
import {
  CustomGlyphDefinitionType,
  type CustomGlyphCharacterDefinition,
} from "./cell-graphics-types.js";

const roundedCorners = {
  "╭": { type: CustomGlyphDefinitionType.ROUND_CORNER, x: 1, y: 1, strokeWidth: 1 },
  "╮": { type: CustomGlyphDefinitionType.ROUND_CORNER, x: -1, y: 1, strokeWidth: 1 },
  "╯": { type: CustomGlyphDefinitionType.ROUND_CORNER, x: -1, y: -1, strokeWidth: 1 },
  "╰": { type: CustomGlyphDefinitionType.ROUND_CORNER, x: 1, y: -1, strokeWidth: 1 },
} as const satisfies Record<string, CustomGlyphCharacterDefinition>;

/** Pinned xterm.js definitions with the four accepted CharDesk round-corner overrides. */
export const cellGraphicDefinitions: Readonly<Record<string, CustomGlyphCharacterDefinition | undefined>> = {
  ...customGlyphDefinitions,
  ...roundedCorners,
};

export { CustomGlyphDefinitionType } from "./cell-graphics-types.js";
