import type { SurfaceVariant } from "./surface-variant.js";

export type CellUiRecipe = Readonly<{
  defaultControlVariant?: SurfaceVariant;
}>;

export const resolveCellUiRecipe = (
  recipe: CellUiRecipe | undefined,
): CellUiRecipe => recipe?.defaultControlVariant === "surface" || recipe?.defaultControlVariant === "ghost"
  ? { defaultControlVariant: recipe.defaultControlVariant }
  : {};
