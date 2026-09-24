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
}>;

export const resolveCellStateStyle = (
  local: CellTextStyle,
  state: CellVisualState,
  theme: CellUiTheme
): CellTextStyle => {
  const resolved = {
    ...local,
    ...(state.hovered && state.collection && !state.focused && !state.selected && !state.disabled
      ? theme.hoveredItemStyle : {}),
    ...(state.focused && !state.selected ? theme.focusedSurfaceStyle : {}),
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

const preservesEditorSurfaceWhenActive = (node: WidgetNode): boolean =>
  node.kind === "combobox-input"
  || (node.kind === "text-input" && node.surfaceVariant !== "surface");

const editorSelectionStyle = (base: CellTextStyle, theme: CellUiTheme): CellTextStyle => {
  const background = base.backgroundColor ?? theme.background;
  const foreground = base.color ?? theme.foreground;
  const selectedBackground = theme.textSelectionStyle.backgroundColor ?? background;
  return selectedBackground.trim().toLowerCase() === background.trim().toLowerCase()
    ? { color: background, backgroundColor: foreground }
    : theme.textSelectionStyle;
};

export const resolveEditorGlyphStyle = (
  base: CellTextStyle,
  state: Readonly<{ selected?: boolean; composing?: boolean }>,
  theme: CellUiTheme,
  node: WidgetNode,
): CellTextStyle => ({
  ...base,
  ...(!node.disabled && node.focusActive && state.selected ? editorSelectionStyle(base, theme) : {}),
  ...(!node.disabled && state.composing ? { underline: true } : {}),
});

const surfaceStyleForNode = (
  tree: WidgetTree,
  node: WidgetNode,
  theme: CellUiTheme,
): CellTextStyle | null => {
  let current: WidgetNode | undefined = node;
  let backgroundColor: string | undefined;
  let hasSurfaceOwner = false;
  while (current) {
    backgroundColor ??= current.textStyle.backgroundColor;
    hasSurfaceOwner ||= current.surfaceVariant !== null;
    if (current.kind === "badge" || current.kind === "badge-action" || current.kind === "alert") {
      const statusStyle = theme.badgeStyles[current.badgeTone];
      return {
        ...(current.kind === "alert" && current.surfaceVariant === "ghost"
          ? { color: statusStyle.color }
          : statusStyle),
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    if (current.kind === "table-row" && current.rowIndex !== null && current.rowIndex % 2 === 0
      && current.parentId && tree.nodes.get(current.parentId)?.surfaceVariant === "surface") {
      return { ...theme.surfaceStyle, ...(backgroundColor !== undefined ? { backgroundColor } : {}) };
    }
    if (current.surfaceVariant === "surface") {
      return {
        ...theme.elevatedSurfaceStyle,
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    if ((current.dialog || current.kind === "tooltip") && current.surfaceVariant === "ghost") {
      return {
        ...theme.surfaceStyle,
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return backgroundColor !== undefined
    ? { backgroundColor }
    : hasSurfaceOwner ? {} : null;
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
      ...(node.kind === "alert"
        ? { color: theme.badgeStyles[node.badgeTone].color ?? theme.borderStyle.color }
        : {}),
      ...(projection.editingActive ? { color: style.color, backgroundColor: style.backgroundColor } : {}),
    },
  });
  if (isTextEditorKind(node.kind)) {
    const singleLine = node.kind === "text-input" || node.kind === "combobox-input";
    const surface = surfaceStyleForNode(tree, node, theme);
    return finish(
      {
        ...(surface ?? (singleLine ? theme.elevatedSurfaceStyle : {})),
        ...node.textStyle,
        ...(projection.editingActive && !preservesEditorSurfaceWhenActive(node)
          ? theme.focusedSurfaceStyle : {}),
        ...(projection.disabled ? theme.disabledStyle : {}),
      },
      theme.sliderThumb,
      singleLine || node.surfaceVariant === "surface" || node.frame === "bordered" ? "layout" : "content",
    );
  }
  const { owner } = projection;
  const focusNode = owner ?? node;
  const rule = feedbackRule(owner?.kind ?? node.kind);
  const solid = owner?.kind === "button" && owner.buttonVariant === "solid";
  const disabled = node.disabled || owner?.disabled;
  const surface = surfaceStyleForNode(tree, node, theme);
  const confirmation = owner?.confirmation;
  if (confirmation && !disabled) {
    const { reference, phase } = confirmation;
    const colors = phase % 2 === 0
      ? { color: reference.backgroundColor, backgroundColor: reference.color }
      : reference;
    return finish({ ...node.textStyle, ...colors });
  }
  const focused = (focusNode.focused && focusNode.focusVisible) || focusNode.active;
  if (owner?.kind === "tab") {
    const selectedSolid = owner.selected && owner.tabsVariant === "solid";
    const tabStyle = {
      ...(surface ?? {}),
      ...node.textStyle,
      ...(disabled ? theme.disabledStyle
        : selectedSolid ? theme.selectedStyle : { color: theme.foreground }),
      ...(!disabled && !owner.selected && owner.hovered ? theme.hoveredItemStyle : {}),
      ...(!disabled && !owner.selected && (focused || owner.pressActive) ? { bold: true } : {}),
    };
    return finish(tabStyle);
  }
  const base = solid
    ? disabled ? theme.surfaceStyle : theme.buttonSolidStyle
    : owner?.kind === "button" && owner.buttonVariant === "surface"
      ? { color: theme.foreground, ...theme.elevatedSurfaceStyle }
    : surface ?? {};
  if (owner && isPrimitiveControlKind(owner.kind)) {
    if (rule.region === "thumb") {
      const appearance = resolveThumbAppearance({ ...base, ...node.textStyle }, projection, theme);
      return finish(appearance.style, appearance.thumb);
    }
    return finish(resolvePrimitiveAppearance({ ...base, ...node.textStyle }, projection, theme));
  }
  const style = resolveCellStateStyle({ ...base, ...node.textStyle }, {
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
