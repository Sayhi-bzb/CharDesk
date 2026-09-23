import { useLayoutEffect, useState, type RefObject } from "react";
import { DEFAULT_CELL_UI_THEME, type CellUiTheme } from "./theme.js";
import type { CellUiRecipe } from "./recipe.js";

export type CellCssTheme = Readonly<{
  theme: CellUiTheme;
  palette: Readonly<{ color: string; background: string }>;
  recipe: CellUiRecipe;
}>;

const fallback = DEFAULT_CELL_UI_THEME;
const defaults = {
  background: fallback.background,
  foreground: fallback.foreground,
  surface: fallback.surfaceStyle.backgroundColor!,
  "surface-elevated": fallback.elevatedSurfaceStyle.backgroundColor!,
  "button-solid": fallback.buttonSolidStyle.backgroundColor!,
  "button-solid-foreground": fallback.buttonSolidStyle.color!,
  "badge-neutral": fallback.badgeStyles.neutral.backgroundColor!,
  "badge-neutral-foreground": fallback.badgeStyles.neutral.color!,
  "badge-info": fallback.badgeStyles.info.backgroundColor!,
  "badge-info-foreground": fallback.badgeStyles.info.color!,
  "badge-success": fallback.badgeStyles.success.backgroundColor!,
  "badge-success-foreground": fallback.badgeStyles.success.color!,
  "badge-warning": fallback.badgeStyles.warning.backgroundColor!,
  "badge-warning-foreground": fallback.badgeStyles.warning.color!,
  "badge-error": fallback.badgeStyles.error.backgroundColor!,
  "badge-error-foreground": fallback.badgeStyles.error.color!,
  highlight: fallback.focusedSurfaceStyle.backgroundColor!,
  hover: fallback.hoveredItemStyle.backgroundColor!,
  "highlight-foreground": fallback.focusedSurfaceStyle.color!,
  "muted-foreground": fallback.secondaryStyle.color!,
  "disabled-foreground": fallback.disabledStyle.color!,
  border: fallback.borderStyle.color!,
  selection: fallback.textSelectionStyle.backgroundColor!,
  "selection-foreground": fallback.textSelectionStyle.color!,
  "range-surface": fallback.rangeStyle.surface,
  "range-border": fallback.rangeStyle.border,
  cursor: fallback.cursorStyle.color,
  "cursor-foreground": fallback.cursorStyle.textColor,
  "scrollbar-thumb": fallback.scrollThumbStyle.color!,
  "scrollbar-track": fallback.scrollTrackStyle.color!,
};

const readRangeSurfaceEffect = (
  source: CSSStyleDeclaration
): NonNullable<CellUiTheme["rangeStyle"]["surfaceEffect"]> => {
  const value = source.getPropertyValue("--cell-range-surface-effect").trim();
  return value === "tint" || value === "contrast"
    ? value
    : fallback.rangeStyle.surfaceEffect ?? "tint";
};

const readRecipe = (source: CSSStyleDeclaration): CellUiRecipe => {
  const value = source.getPropertyValue("--cell-default-control-variant").trim();
  if (value === "surface" || value === "ghost") return { defaultControlVariant: value };
  if (value && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
    console.warn("[cell-ui] Invalid --cell-default-control-variant; using component defaults.");
  }
  return {};
};

// One temporary color resolver per theme read, never DOM per Cell.
export const readCellCssTheme = (element: HTMLElement): CellCssTheme => {
  const view = element.ownerDocument.defaultView!;
  const source = view.getComputedStyle(element);
  const probe = element.ownerDocument.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden";
  probe.setAttribute("aria-hidden", "true");
  element.append(probe);
  const colors = { ...defaults };
  try {
    for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
      const token = `--cell-${key}`;
      const raw = source.getPropertyValue(token).trim();
      probe.style.color = "";
      if (raw) probe.style.color = raw;
      if (!probe.style.color || raw.includes("var(")) {
        const development = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;
        if (development) console.warn(`[cell-ui] Missing or invalid ${token}; using default.`);
        continue;
      }
      colors[key] = view.getComputedStyle(probe).color;
    }
  } finally {
    probe.remove();
  }
  const highlight = { color: colors["highlight-foreground"], backgroundColor: colors.highlight };
  return {
    palette: { color: colors.foreground, background: colors.background },
    recipe: readRecipe(source),
    theme: {
      ...fallback,
      background: colors.background,
      foreground: colors.foreground,
      surfaceStyle: { backgroundColor: colors.surface },
      elevatedSurfaceStyle: { backgroundColor: colors["surface-elevated"] },
      buttonSolidStyle: {
        color: colors["button-solid-foreground"],
        backgroundColor: colors["button-solid"],
      },
      badgeStyles: {
        neutral: { color: colors["badge-neutral-foreground"], backgroundColor: colors["badge-neutral"] },
        info: { color: colors["badge-info-foreground"], backgroundColor: colors["badge-info"] },
        success: { color: colors["badge-success-foreground"], backgroundColor: colors["badge-success"] },
        warning: { color: colors["badge-warning-foreground"], backgroundColor: colors["badge-warning"] },
        error: { color: colors["badge-error-foreground"], backgroundColor: colors["badge-error"] },
      },
      borderStyle: { color: colors.border },
      focusedSurfaceStyle: highlight,
      hoveredItemStyle: { backgroundColor: colors.hover },
      selectedStyle: highlight,
      secondaryStyle: { color: colors["muted-foreground"] },
      disabledStyle: { color: colors["disabled-foreground"] },
      textSelectionStyle: { color: colors["selection-foreground"], backgroundColor: colors.selection },
      cursorStyle: {
        ...fallback.cursorStyle,
        color: colors.cursor,
        textColor: colors["cursor-foreground"],
      },
      rangeStyle: {
        surface: colors["range-surface"],
        border: colors["range-border"],
        surfaceEffect: readRangeSurfaceEffect(source),
      },
      scrollThumbStyle: { color: colors["scrollbar-thumb"] },
      scrollTrackStyle: { color: colors["scrollbar-track"] },
    },
  };
};

export const useCellCssTheme = (
  ref: RefObject<HTMLElement | null>,
  revision: string | number
): CellCssTheme => {
  const [value, setValue] = useState<CellCssTheme>(() => ({
    theme: fallback,
    palette: { color: fallback.foreground, background: fallback.background },
    recipe: {},
  }));
  useLayoutEffect(() => {
    if (ref.current) setValue(readCellCssTheme(ref.current));
  }, [ref, revision]);
  return value;
};
