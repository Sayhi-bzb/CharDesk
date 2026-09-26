import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  MeasureMode,
  Overflow,
  PositionType,
  Wrap,
  type Config,
  type Node as YogaNode,
} from "yoga-layout";
import { collectionChromeMetrics } from "./collection-chrome.js";
import type {
  CellLayoutStyle,
  CellInsets,
  CellRect,
  CellSize,
  LayoutEntry,
  LayoutSnapshot,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import {
  fitInlineControlChromeInsets,
  inlineControlChromeInsets,
  inlineControlChromeMetrics,
  inlineControlSpacingRecipe,
} from "./inline-control-chrome.js";
import { isCollectionItemKind } from "./widget-capabilities.js";
import { hasInlineOutline, INLINE_OUTLINE_INSET } from "./inline-outline.js";
import { cellTextWidth, isSingleLineControlText, singleLineText } from "./single-line-text.js";
import { walkCellTextRows } from "./text-lines.js";

const integer = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return Math.round(value);
};

const validateViewport = (viewport: CellSize): CellRect => {
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 0 || viewport.height < 0) {
    throw new RangeError("Viewport dimensions must be non-negative integers.");
  }
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
};

const computedInsets = (
  node: YogaNode,
  read: (edge: Edge) => number,
  label: string
): CellInsets => ({
  top: integer(read.call(node, Edge.Top), `${label}.top`),
  right: integer(read.call(node, Edge.Right), `${label}.right`),
  bottom: integer(read.call(node, Edge.Bottom), `${label}.bottom`),
  left: integer(read.call(node, Edge.Left), `${label}.left`),
});

const applyStyle = (
  target: YogaNode,
  style: CellLayoutStyle,
  bordered: boolean,
): void => {
  target.setFlexDirection(style.direction === "row" ? FlexDirection.Row : FlexDirection.Column);
  target.setFlexWrap(style.wrap ? Wrap.Wrap : Wrap.NoWrap);
  target.setWidth(style.width);
  target.setHeight(style.height);
  target.setMinWidth(style.minWidth);
  target.setMinHeight(style.minHeight);
  target.setMaxWidth(style.maxWidth);
  target.setMaxHeight(style.maxHeight);
  target.setFlexGrow(style.flexGrow);
  target.setFlexShrink(style.flexShrink);
  target.setGap(Gutter.All, style.gap);
  target.setPadding(Edge.All, style.padding);
  target.setPadding(Edge.Top, style.paddingTop);
  target.setPadding(Edge.Right, style.paddingRight);
  target.setPadding(Edge.Bottom, style.paddingBottom);
  target.setPadding(Edge.Left, style.paddingLeft);
  target.setBorder(Edge.All, bordered ? 1 : 0);
};

const measureText = (
  text: string,
  availableWidth: number,
  widthMode: MeasureMode,
  singleLine: boolean,
) => {
  const constrained = widthMode !== MeasureMode.Undefined;
  const widthLimit = constrained ? Math.max(1, Math.floor(availableWidth)) : Number.POSITIVE_INFINITY;
  if (singleLine) return {
    width: Math.min(widthLimit, cellTextWidth(singleLineText(text))),
    height: 1,
  };
  const measured = walkCellTextRows(text, widthLimit);
  return {
    width: constrained ? Math.min(widthLimit, measured.width) : measured.width,
    height: measured.height,
  };
};

const textAreaSurfaceInsets = (node: WidgetNode, width?: number) => {
  if (node.kind !== "text-area" || node.presentation !== "rich"
    || node.surfaceVariant !== "surface" || node.frame !== "none") return null;
  const explicitLeft = node.style.paddingLeft ?? node.style.padding;
  const explicitRight = node.style.paddingRight ?? node.style.padding;
  const defaultBudget = width === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, width - 1 - (explicitLeft ?? 0) - (explicitRight ?? 0));
  const left = explicitLeft ?? Math.min(1, defaultBudget);
  const right = explicitRight ?? Math.min(1, Math.max(0, defaultBudget - (explicitLeft === undefined ? left : 0)));
  return { left, right };
};

const dropdownNaturalWidth = (tree: WidgetTree, owner: WidgetNode): number | null => {
  if (owner.kind !== "select" && owner.kind !== "combobox") return null;
  const [controlId, contentId] = owner.children;
  const control = controlId ? tree.nodes.get(controlId) : undefined;
  const content = contentId ? tree.nodes.get(contentId) : undefined;
  if (!control) return null;
  const textWidth = (node: WidgetNode): number => node.kind === "text"
    ? cellTextWidth(singleLineText(node.text ?? ""))
    : node.children.reduce((width, id) => width + textWidth(tree.nodes.get(id)!), 0);
  const chromeWidth = (node: WidgetNode): number => {
    const rich = inlineControlChromeInsets(inlineControlChromeMetrics({ ...node, presentation: "rich" }));
    const plain = inlineControlChromeInsets(inlineControlChromeMetrics({ ...node, presentation: "text" }));
    return Math.max(rich.left + rich.right, plain.left + plain.right);
  };
  const hasItems = content?.children.some((id) => {
    const kind = tree.nodes.get(id)?.kind;
    return kind === "select-item" || kind === "combobox-item";
  }) ?? false;
  const controlText = control.kind === "combobox-input"
    ? hasItems ? 0 : cellTextWidth(singleLineText(control.textEditor?.value ?? ""))
    : Math.max(textWidth(control), cellTextWidth(singleLineText(control.placeholder ?? "")));
  let width = Math.max(controlText + chromeWidth(control),
    typeof control.style.width === "number" ? control.style.width : 0,
    content && typeof content.style.width === "number" ? content.style.width : 0);
  for (const id of content?.children ?? []) {
    const item = tree.nodes.get(id)!;
    const itemWidth = textWidth(item) + chromeWidth(item) + 2;
    width = Math.max(width, itemWidth, typeof item.style.width === "number" ? item.style.width + 2 : 0);
  }
  return Math.max(1, width);
};

const configureNode = (node: WidgetNode, target: YogaNode, tree: WidgetTree): void => {
  target.setPositionType(PositionType.Relative);
  for (const edge of [Edge.Top, Edge.Right, Edge.Bottom, Edge.Left]) target.setPosition(edge, undefined);
  const item = isCollectionItemKind(node.kind);
  const row = node.kind === "tabs" || node.kind === "grid-row" || node.kind === "table-header" || node.kind === "table-row";
  const column = node.kind === "list"
    || node.kind === "menu"
    || node.kind === "tree"
    || node.kind === "grid"
    || node.kind === "table"
    || node.kind === "select"
    || node.kind === "select-content"
    || node.kind === "combobox"
    || node.kind === "combobox-content";
  const defaults: CellLayoutStyle = node.kind === "spinner"
    ? { width: 1, height: 1, flexShrink: 0 }
    : node.kind === "progress"
    ? { width: 20, height: 1, flexShrink: 0 }
    : node.kind === "separator"
      ? node.orientation === "vertical"
        ? { width: 1, height: "100%", flexShrink: 0 }
        : { width: "100%", height: 1, flexShrink: 0 }
    : node.kind === "radio-group"
      ? { direction: node.orientation === "horizontal" ? "row" : "column", flexShrink: 0 }
    : node.kind === "toggle"
      ? { direction: "row", minHeight: 1, flexShrink: 0 }
    : node.kind === "radio-item"
      ? { direction: "row", minHeight: 1, flexShrink: 0 }
    : item
    ? {
        direction: "row",
        minHeight: 1,
        flexShrink: 0,
      }
    : node.kind === "slider" || node.kind === "range-slider"
      ? { width: 20, minWidth: 2, minHeight: 1, flexShrink: 0 }
    : node.kind === "range-slider-thumb"
      ? { width: 1, height: 1, flexShrink: 0 }
    : node.kind === "button"
      ? { direction: "row", minHeight: 1, flexShrink: 0 }
    : node.kind === "badge" || node.kind === "badge-action"
      ? { direction: "row", height: 1, flexShrink: 0 }
    : node.kind === "checkbox"
      ? {
          direction: "row",
          minHeight: 1,
          flexShrink: 0,
          paddingLeft: 0,
          paddingRight: 0,
        }
    : node.kind === "select-trigger"
      ? {
          direction: "row",
          minHeight: 1,
          flexShrink: 0,
        }
    : node.kind === "select-content" || node.kind === "combobox-content"
      ? { direction: "column", width: "100%", flexShrink: 0 }
    : row
      ? { direction: "row", gap: node.kind === "tabs" && node.orientation !== "vertical" ? 2 : 0, flexShrink: 0 }
    : column
      ? { direction: "column", flexShrink: 0 }
      : node.kind === "combobox-input"
        ? { width: "100%", height: 1, flexShrink: 0 }
      : node.kind === "text-input"
        ? { height: 1, flexShrink: 0 }
        : node.kind === "text-area"
          ? { minHeight: 3, flexShrink: 0 }
          : {};
  applyStyle(target, {
    ...defaults,
    ...node.style,
  }, node.frame === "bordered");
  const textAreaInsets = textAreaSurfaceInsets(node, typeof node.style.width === "number" ? node.style.width : undefined);
  if (textAreaInsets) {
    target.setPadding(Edge.Left, textAreaInsets.left);
    target.setPadding(Edge.Right, textAreaInsets.right);
  }
  if (node.kind === "badge" || node.kind === "badge-action") target.setAlignSelf(Align.FlexStart);
  target.setDisplay((node.kind === "accordion-content" && !node.expanded) || node.hidden
    ? Display.None : Display.Flex);
  if (node.kind === "accordion-trigger") {
    target.setFlexDirection(FlexDirection.Row);
    target.setMinHeight(1);
    target.setFlexShrink(0);
    target.setPadding(Edge.Left, (node.style.paddingLeft ?? node.style.padding ?? 0) + 2);
  }
  if (node.kind === "list-item" || node.kind === "tree-item" || node.kind === "grid-cell") {
    const chrome = collectionChromeMetrics(node);
    const requestedLeft = (node.style.paddingLeft ?? node.style.padding ?? 0) + chrome.contentInset;
    const requestedRight = (node.style.paddingRight ?? node.style.padding ?? 0) + chrome.trailingGuard;
    const explicitWidth = typeof node.style.width === "number" ? Math.max(0, node.style.width) : null;
    const left = explicitWidth === null ? requestedLeft : Math.min(requestedLeft, Math.max(0, explicitWidth - 1));
    const right = explicitWidth === null ? requestedRight : Math.min(requestedRight, Math.max(0, explicitWidth - left - 1));
    target.setPadding(Edge.Left, left);
    target.setPadding(Edge.Right, right);
  }
  if (node.kind === "menu-item") {
    target.setPadding(Edge.Left, (node.style.paddingLeft ?? node.style.padding ?? 0) + 2);
    target.setPadding(Edge.Right, (node.style.paddingRight ?? node.style.padding ?? 0) + 1);
  }
  if (node.kind === "tab" && node.tabsVariant === "underline") {
    target.setMinHeight(2);
    target.setPadding(Edge.Bottom, (node.style.paddingBottom ?? node.style.padding ?? 0) + 1);
  }
  const spacing = inlineControlSpacingRecipe(node);
  const ownedInlineChromeInsets = inlineControlChromeInsets(spacing.chrome);
  const outlineInset = hasInlineOutline(node) ? INLINE_OUTLINE_INSET : 0;
  if (
    spacing.defaultContentInsets.left > 0
    || spacing.defaultContentInsets.right > 0
    || ownedInlineChromeInsets.left > 0
    || ownedInlineChromeInsets.right > 0
    || outlineInset > 0
  ) {
    const inlineChromeInsets = fitInlineControlChromeInsets({
      left: (node.style.paddingLeft ?? node.style.padding ?? spacing.defaultContentInsets.left)
        + ownedInlineChromeInsets.left + outlineInset,
      right: (node.style.paddingRight ?? node.style.padding ?? spacing.defaultContentInsets.right)
        + ownedInlineChromeInsets.right + outlineInset,
    }, typeof node.style.width === "number" ? node.style.width : undefined);
    target.setPadding(
      Edge.Left,
      inlineChromeInsets.left,
    );
    target.setPadding(
      Edge.Right,
      inlineChromeInsets.right,
    );
  }
  if (node.kind === "overlay" || node.kind === "select-content" || node.kind === "combobox-content" || node.kind === "tooltip" || node.kind === "range-slider-thumb") {
    target.setPositionType(PositionType.Absolute);
    target.setPosition(Edge.Left, node.kind === "overlay" ? node.overlayPosition?.x ?? 0 : 0);
    target.setPosition(Edge.Top, node.kind === "overlay" ? node.overlayPosition?.y ?? 0 : 0);
  } else if (node.style.position === "absolute") {
    target.setPositionType(PositionType.Absolute);
    for (const [edge, value] of [
      [Edge.Top, node.style.top],
      [Edge.Right, node.style.right],
      [Edge.Bottom, node.style.bottom],
      [Edge.Left, node.style.left],
    ] as const) {
      if (value !== undefined) target.setPosition(edge, value);
    }
  }
  if (node.kind === "scroll-area") target.setOverflow(Overflow.Hidden);
  if (node.kind === "text" || node.kind === "markdown-link") {
    const singleLine = isSingleLineControlText(tree, node);
    target.setMeasureFunc((width, widthMode) => measureText(node.text ?? "", width, widthMode, singleLine));
  }
};

export interface LayoutEngine {
  compute(tree: WidgetTree, viewport: CellSize): LayoutSnapshot;
  dispose(): void;
}

export type YogaResourceCounts = Readonly<{ configs: number; nodes: number }>;

const liveYogaResources = { configs: 0, nodes: 0 };

export class YogaLayoutEngine implements LayoutEngine {
  readonly #config: Config;
  readonly #nodes = new Map<string, YogaNode>();
  #tree: WidgetTree | undefined;
  #disposed = false;

  constructor() {
    this.#config = Yoga.Config.create();
    liveYogaResources.configs += 1;
    this.#config.setPointScaleFactor(1);
  }

  static getResourceCounts(): YogaResourceCounts {
    return { ...liveYogaResources };
  }

  compute(tree: WidgetTree, viewport: CellSize): LayoutSnapshot {
    if (this.#disposed) throw new Error("YogaLayoutEngine has been disposed.");
    const viewportRect = validateViewport(viewport);
    if (!tree.rootId) {
      this.#freeAllNodes();
      this.#tree = tree;
      return { viewport: viewportRect, entries: new Map() };
    }

    for (const node of this.#nodes.values()) {
      while (node.getChildCount() > 0) node.removeChild(node.getChild(0));
    }
    for (const [id, node] of [...this.#nodes]) {
      const before = this.#tree?.nodes.get(id);
      const after = tree.nodes.get(id);
      if (after && before?.kind === after.kind) continue;
      node.free();
      this.#nodes.delete(id);
      liveYogaResources.nodes -= 1;
    }
    for (const [id, widget] of tree.nodes) {
      let node = this.#nodes.get(id);
      if (!node) {
        node = Yoga.Node.create(this.#config);
        this.#nodes.set(id, node);
        liveYogaResources.nodes += 1;
      }
      configureNode(widget, node, tree);
      if ((widget.kind === "select" || widget.kind === "combobox") && widget.style.width === undefined) {
        const naturalWidth = dropdownNaturalWidth(tree, widget);
        if (naturalWidth !== null) node.setWidth(naturalWidth);
      }
      if (widget.dialog) {
        const max = widget.style.maxWidth;
        const limit = typeof max === "string" ? viewport.width * parseFloat(max) / 100 : max ?? viewport.width;
        node.setMaxWidth(Math.min(limit, viewport.width));
      }
    }
    for (const [id, widget] of tree.nodes) {
      const parent = this.#nodes.get(id)!;
      widget.children.forEach((childId, index) => {
        const child = this.#nodes.get(childId);
        if (!child) throw new Error(`Missing Yoga node: ${childId}`);
        parent.insertChild(child, index);
      });
    }

    const root = this.#nodes.get(tree.rootId);
    if (!root) throw new Error(`Missing Yoga root: ${tree.rootId}`);
    root.setWidth(viewport.width);
    root.setHeight(viewport.height);
    let adjustedTextAreaInsets = false;
    // Auto widths can shrink again as each default inset collapses.
    for (let pass = 0; pass < 4; pass++) {
      root.calculateLayout(viewport.width, viewport.height, Direction.LTR);
      adjustedTextAreaInsets = false;
      for (const [id, widget] of tree.nodes) {
        const yogaNode = this.#nodes.get(id)!;
        const insets = textAreaSurfaceInsets(widget, yogaNode.getComputedLayout().width);
        if (!insets || (yogaNode.getComputedPadding(Edge.Left) === insets.left
          && yogaNode.getComputedPadding(Edge.Right) === insets.right)) continue;
        yogaNode.setPadding(Edge.Left, insets.left);
        yogaNode.setPadding(Edge.Right, insets.right);
        adjustedTextAreaInsets = true;
      }
      if (!adjustedTextAreaInsets) break;
    }
    if (adjustedTextAreaInsets) throw new Error("TextArea surface insets did not converge.");
    const entries = new Map<string, LayoutEntry>();
    for (const [id, widget] of tree.nodes) {
      const yogaNode = this.#nodes.get(id);
      if (!yogaNode) throw new Error(`Missing Yoga node: ${id}`);
      const computed = yogaNode.getComputedLayout();
      const rect = {
        x: integer(computed.left, `${id}.x`),
        y: integer(computed.top, `${id}.y`),
        width: integer(computed.width, `${id}.width`),
        height: integer(computed.height, `${id}.height`),
      };
      const borderInsets = computedInsets(
        yogaNode,
        yogaNode.getComputedBorder,
        `${id}.border`
      );
      const paddingInsets = computedInsets(
        yogaNode,
        yogaNode.getComputedPadding,
        `${id}.padding`
      );
      const left = borderInsets.left + paddingInsets.left;
      const top = borderInsets.top + paddingInsets.top;
      const right = borderInsets.right + paddingInsets.right;
      const bottom = borderInsets.bottom + paddingInsets.bottom;
      entries.set(id, {
        id,
        parentId: widget.parentId,
        rect,
        borderInsets,
        paddingInsets,
        contentRect: {
          x: left,
          y: top,
          width: Math.max(0, rect.width - left - right),
          height: Math.max(0, rect.height - top - bottom),
        },
      });
    }
    this.#tree = tree;
    return { viewport: viewportRect, entries };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#freeAllNodes();
    this.#config.free();
    liveYogaResources.configs -= 1;
    this.#disposed = true;
  }

  #freeAllNodes(): void {
    if (this.#nodes.size === 0) return;
    for (const node of this.#nodes.values()) {
      while (node.getChildCount() > 0) node.removeChild(node.getChild(0));
    }
    for (const node of this.#nodes.values()) node.free();
    liveYogaResources.nodes -= this.#nodes.size;
    this.#nodes.clear();
  }
}
