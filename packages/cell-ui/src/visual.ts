import type { CellTextStyle, WidgetNode, WidgetTree } from "./types.js";
import type { CellUiTheme } from "./theme.js";
import { isPrimitiveControlKind, isFilledSurfaceKind, feedbackRule } from "./widget-capabilities.js";
import { projectWidgetState } from "./visual-state.js";
import { resolvePrimitiveAppearance } from "./primitive-appearance.js";

export type CellVisualState = Readonly<{
  hovered?: boolean;
  pressActive?: boolean;
  activationFlash?: boolean;
  focused?: boolean;
  selected?: boolean;
  disabled?: boolean;
  collection?: boolean;
  primary?: boolean;
}>;

export const resolveCellStateStyle = (
  local: CellTextStyle,
  state: CellVisualState,
  theme: CellUiTheme
): CellTextStyle => {
  const resolved = {
    ...local,
    ...(state.hovered && state.collection && !state.focused && !state.selected && !state.disabled
      ? state.primary ? theme.buttonPrimaryHoverStyle : theme.hoveredItemStyle : {}),
    ...(state.focused && !state.selected && !state.primary ? theme.focusedSurfaceStyle : {}),
    ...(state.selected ? theme.selectedStyle : {}),
    ...(state.focused && state.collection ? theme.focusedItemStyle : {}),
    ...(state.disabled ? theme.disabledStyle : {}),
  };
  if ((!state.pressActive && !state.activationFlash) || state.disabled) return resolved;
  return {
    ...resolved,
    color: resolved.backgroundColor ?? theme.background,
    backgroundColor: resolved.color ?? theme.foreground,
  };
};

export const resolveCellTextStyle = (
  base: CellTextStyle,
  state: Readonly<{ selected?: boolean; composing?: boolean }>,
  theme: CellUiTheme
): CellTextStyle => ({
  ...base,
  ...(state.selected ? theme.textSelectionStyle : {}),
  ...(state.composing ? { underline: true } : {}),
});

export const resolveWidgetVisual = (tree: WidgetTree, node: WidgetNode, theme: CellUiTheme) => {
  const projection = projectWidgetState(tree, node);
  const { owner } = projection;
  const focusNode = owner ?? node;
  const rule = feedbackRule(owner?.kind ?? node.kind);
  const primary = owner?.kind === "button" && owner.buttonVariant === "default";
  const disabled = node.disabled || owner?.disabled;
  const focused = focusNode.focused && focusNode.focusVisible;
  const base = primary
    ? disabled ? theme.surfaceStyle : theme.buttonPrimaryStyle
    : isFilledSurfaceKind(node.kind) || owner?.kind === "select-trigger" ? theme.surfaceStyle : {};
  if (owner && isPrimitiveControlKind(owner.kind)) {
    return {
      style: resolvePrimitiveAppearance({ ...base, ...node.textStyle }, projection, theme),
      thumb: theme.sliderThumb,
    };
  }
  const style = resolveCellStateStyle({ ...base, ...node.textStyle }, {
    primary,
    focused,
    selected: owner?.selected || owner?.pressed || (owner?.kind === "radio-item" && owner.checked === true),
    hovered: rule.region === "control" ? owner?.hovered : false,
    pressActive: owner?.pressActive,
    activationFlash: owner?.activationFlash,
    collection: owner !== undefined,
    disabled,
  }, theme);
  const emphasizeThumb = rule.region === "thumb" && !disabled
    && (node.manipulating || (node.hovered && !focused));
  return { style, thumb: emphasizeThumb ? theme.sliderEmphasizedThumb : theme.sliderThumb };
};
