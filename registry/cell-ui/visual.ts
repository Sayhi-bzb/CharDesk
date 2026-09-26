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
  let toneColor: string | undefined;
  let hasSurfaceOwner = false;
  while (current) {
    backgroundColor ??= current.textStyle.backgroundColor;
    hasSurfaceOwner ||= current.surfaceVariant !== null
      || (current.kind === "button" && current.buttonVariant === "ghost");
    if (current.kind === "badge" || current.kind === "badge-action" || current.kind === "alert" || current.kind === "toast") {
      const statusStyle = theme.badgeStyles[current.badgeTone];
      if ((current.kind === "alert" || current.kind === "toast") && current.surfaceVariant === "ghost") {
        toneColor ??= statusStyle.color;
      } else {
        return { ...statusStyle, ...(backgroundColor !== undefined ? { backgroundColor } : {}) };
      }
    }
    if (current.kind === "table-row" && current.rowIndex !== null && current.rowIndex % 2 === 0
      && current.parentId && tree.nodes.get(current.parentId)?.surfaceVariant === "surface") {
      return { ...theme.surfaceStyle, ...(toneColor !== undefined ? { color: toneColor } : {}),
        ...(backgroundColor !== undefined ? { backgroundColor } : {}) };
    }
    if (current.surfaceVariant === "surface") {
      return {
        ...theme.elevatedSurfaceStyle,
        ...(toneColor !== undefined ? { color: toneColor } : {}),
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      };
    }
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return hasSurfaceOwner || backgroundColor !== undefined
    ? { ...(toneColor !== undefined ? { color: toneColor } : {}),
        backgroundColor: backgroundColor ?? theme.background }
    : null;
};

export const resolveWidgetVisual = (tree: WidgetTree, node: WidgetNode, theme: CellUiTheme) => {
  const projection = projectWidgetState(tree, node);
  const finish = (
    style: CellTextStyle,
    thumb = theme.sliderThumb,
    surfaceRegion: "layout" | "decoration" | "content" = "layout",
    borderBaseStyle: CellTextStyle = style,
  ) => ({
    style,
    thumb,
    surfaceRegion,
    borderStyle: {
      ...borderBaseStyle,
      ...theme.borderStyle,
      ...(node.kind === "alert" || node.kind === "toast"
        ? { color: theme.badgeStyles[node.badgeTone].color ?? theme.borderStyle.color }
        : {}),
      ...(node.invalid ? { color: theme.semanticColors.danger.text } : {}),
      ...(projection.editingActive && node.kind !== "text-area"
        ? { color: style.color, backgroundColor: style.backgroundColor } : {}),
    },
  });
  if (isTextEditorKind(node.kind)) {
    const singleLine = node.kind === "text-input" || node.kind === "combobox-input";
    const surface = surfaceStyleForNode(tree, node, theme);
    const borderBaseStyle = {
      ...(surface ?? (singleLine ? theme.elevatedSurfaceStyle : {})),
      ...(node.invalid && !node.disabled ? { color: theme.semanticColors.danger.surfaceForeground,
        backgroundColor: theme.semanticColors.danger.surface } : {}),
      ...node.textStyle,
      ...(projection.disabled ? theme.disabledStyle : {}),
    };
    return finish(
      {
        ...borderBaseStyle,
        ...(projection.editingActive && !preservesEditorSurfaceWhenActive(node)
          ? theme.focusedSurfaceStyle : {}),
      },
      theme.sliderThumb,
      node.kind === "text-area" && node.frame === "bordered"
        ? "decoration"
        : "layout",
      node.kind === "text-area" ? borderBaseStyle : undefined,
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
  const markdownStyle: CellTextStyle = {
    ...(node.markdownTone ? { color: theme.markdownColors[node.markdownTone] } : {}),
    ...(node.markdownCode ? { color: theme.markdownColors.codeForeground,
      backgroundColor: theme.markdownColors.codeBackground } : {}),
  };
  const base = solid
    ? disabled ? theme.surfaceStyle : owner?.buttonTone === "danger"
      ? { color: theme.background,
        backgroundColor: theme.semanticColors.danger.text } : theme.buttonSolidStyle
    : owner?.kind === "button" && owner.buttonVariant === "surface"
      ? owner.buttonTone === "danger"
        ? { color: theme.semanticColors.danger.surfaceForeground,
          backgroundColor: theme.semanticColors.danger.surface }
        : { color: theme.foreground, ...theme.elevatedSurfaceStyle }
    : surface ?? {};
  const semanticBase = {
    ...base,
    ...(node.kind === "markdown-link" && !node.markdownTone
      ? { color: theme.semanticColors.info.text } : {}),
    ...(!disabled && owner?.kind === "button" && owner.buttonTone === "danger" && !solid
      && owner.buttonVariant !== "surface" ? { color: theme.semanticColors.danger.text } : {}),
    ...(!disabled && (node.invalid || owner?.invalid) && owner?.kind !== "button"
      ? { color: theme.semanticColors.danger.text } : {}),
  };
  if (owner && isPrimitiveControlKind(owner.kind)) {
    if (rule.region === "thumb") {
      const appearance = resolveThumbAppearance({ ...semanticBase, ...node.textStyle, ...markdownStyle }, projection, theme);
      return finish(appearance.style, appearance.thumb);
    }
    if (owner.kind === "markdown-link" && owner.current && owner.textStyle.backgroundColor) {
      return finish({ ...semanticBase, ...node.textStyle, ...markdownStyle,
        ...(!disabled && owner.focused && owner.focusVisible ? theme.focusedItemStyle : {}),
        ...(disabled ? theme.disabledStyle : {}) });
    }
    return finish(resolvePrimitiveAppearance({ ...semanticBase, ...node.textStyle, ...markdownStyle }, projection, theme));
  }
  const style = resolveCellStateStyle({ ...semanticBase, ...node.textStyle, ...markdownStyle }, {
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
