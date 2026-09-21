import type { CellTextStyle, WidgetNode, WidgetTree } from "./types.js";
import type { CellUiTheme } from "./theme.js";
import { isPrimitiveControlKind, isTextEditorKind, feedbackRule } from "./widget-capabilities.js";
import { projectWidgetState } from "./visual-state.js";
import { resolvePrimitiveAppearance, resolveThumbAppearance } from "./primitive-appearance.js";

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

const usesUnderlinedSelection = (node: WidgetNode): boolean =>
  node.kind === "text-input" || node.kind === "combobox-input";

const preservesEditorSurfaceWhenActive = (node: WidgetNode): boolean =>
  node.kind === "combobox-input"
  || (node.kind === "text-input" && node.selectionVariant === "plain");

export const resolveEditorGlyphStyle = (
  base: CellTextStyle,
  state: Readonly<{ selected?: boolean; composing?: boolean }>,
  theme: CellUiTheme,
  node: WidgetNode,
): CellTextStyle => usesUnderlinedSelection(node)
  ? {
      ...base,
      ...(!node.disabled && ((state.selected && node.focusActive) || state.composing)
        ? { underline: true } : {}),
    }
  : resolveCellTextStyle(base, state, theme);

const blockSurfaceStyleForNode = (
  tree: WidgetTree,
  node: WidgetNode,
  theme: CellUiTheme,
): CellTextStyle | null => {
  let current: WidgetNode | undefined = node;
  let backgroundColor: string | undefined;
  while (current) {
    backgroundColor ??= current.textStyle.backgroundColor;
    if (current.blockVariant === "elevated") {
      return {
        ...theme.elevatedSurfaceStyle,
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return null;
};

const selectionSurfaceStyleForNode = (
  tree: WidgetTree,
  node: WidgetNode,
  theme: CellUiTheme,
): CellTextStyle | null => {
  let current: WidgetNode | undefined = node;
  let backgroundColor: string | undefined;
  while (current) {
    backgroundColor ??= current.textStyle.backgroundColor;
    if (current.selectionVariant) {
      return {
        ...(current.selectionVariant === "elevated" ? theme.elevatedSurfaceStyle : {}),
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return null;
};

export const resolveWidgetVisual = (tree: WidgetTree, node: WidgetNode, theme: CellUiTheme) => {
  const projection = projectWidgetState(tree, node);
  const finish = (
    style: CellTextStyle,
    thumb = theme.sliderThumb,
    surfaceRegion: "layout" | "content" = "layout",
  ) => ({
    style,
    thumb,
    surfaceRegion,
    borderStyle: {
      ...style,
      ...theme.borderStyle,
      ...(projection.editingActive ? { color: style.color, backgroundColor: style.backgroundColor } : {}),
    },
  });
  if (isTextEditorKind(node.kind)) {
    const singleLine = node.kind === "text-input" || node.kind === "combobox-input";
    const blockSurface = blockSurfaceStyleForNode(tree, node, theme);
    const selectionSurface = node.kind === "combobox-input"
      ? selectionSurfaceStyleForNode(tree, node, theme)
      : node.kind === "text-input"
        ? node.selectionVariant === "plain" ? {} : theme.elevatedSurfaceStyle
        : null;
    return finish(
      {
        ...(selectionSurface ?? (singleLine ? theme.elevatedSurfaceStyle : blockSurface ?? {})),
        ...node.textStyle,
        ...(projection.editingActive && !preservesEditorSurfaceWhenActive(node)
          ? theme.focusedSurfaceStyle : {}),
        ...(projection.disabled ? theme.disabledStyle : {}),
      },
      theme.sliderThumb,
      singleLine || node.blockVariant !== "plain" || node.frame === "bordered" ? "layout" : "content",
    );
  }
  const { owner } = projection;
  const focusNode = owner ?? node;
  const rule = feedbackRule(owner?.kind ?? node.kind);
  const primary = owner?.kind === "button" && owner.buttonVariant === "default";
  const disabled = node.disabled || owner?.disabled;
  const blockSurface = blockSurfaceStyleForNode(tree, node, theme);
  const selectionSurface = selectionSurfaceStyleForNode(tree, node, theme);
  const confirmation = owner?.confirmation;
  if (confirmation && !disabled) {
    const { reference, phase } = confirmation;
    const colors = phase % 2 === 0
      ? { color: reference.backgroundColor, backgroundColor: reference.color }
      : reference;
    return finish({ ...node.textStyle, ...colors });
  }
  const focused = (focusNode.focused && focusNode.focusVisible) || focusNode.active;
  const base = primary
    ? disabled ? theme.surfaceStyle : theme.buttonPrimaryStyle
    : owner?.kind === "button" && owner.buttonVariant === "elevated"
      ? { color: theme.foreground, ...theme.elevatedSurfaceStyle }
    : selectionSurface ?? blockSurface ?? {};
  if (owner && isPrimitiveControlKind(owner.kind)) {
    if (rule.region === "thumb") {
      const appearance = resolveThumbAppearance({ ...base, ...node.textStyle }, projection, theme);
      return finish(appearance.style, appearance.thumb);
    }
    return finish(resolvePrimitiveAppearance({ ...base, ...node.textStyle }, projection, theme));
  }
  const style = resolveCellStateStyle({ ...base, ...node.textStyle }, {
    primary,
    focused,
    selected: owner?.selected,
    hovered: rule.region === "control" ? owner?.hovered : false,
    pressActive: owner?.pressActive,
    activationFlash: owner?.activationFlash,
    collection: owner !== undefined,
    disabled,
  }, theme);
  return finish(style);
};
