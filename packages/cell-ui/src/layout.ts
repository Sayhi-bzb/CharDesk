import {
  getGraphemeCellWidth,
  iterateGraphemes,
} from "@chardesk/protocol";
import Yoga, {
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  MeasureMode,
  Overflow,
  PositionType,
  type Config,
  type Node as YogaNode,
} from "yoga-layout";
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
import { isCollectionItemKind } from "./widget-capabilities.js";

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

const applyStyle = (target: YogaNode, style: CellLayoutStyle): void => {
  target.setFlexDirection(style.direction === "row" ? FlexDirection.Row : FlexDirection.Column);
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
  target.setBorder(Edge.All, style.border ? 1 : 0);
};

const measureText = (
  text: string,
  availableWidth: number,
  widthMode: MeasureMode
) => {
  const constrained = widthMode !== MeasureMode.Undefined;
  const widthLimit = constrained ? Math.max(1, Math.floor(availableWidth)) : Number.POSITIVE_INFINITY;
  let rowWidth = 0;
  let measuredWidth = 0;
  let rows = 1;
  for (const { segment } of iterateGraphemes(text)) {
    if (segment === "\n") {
      measuredWidth = Math.max(measuredWidth, rowWidth);
      rowWidth = 0;
      rows += 1;
      continue;
    }
    const cellWidth = getGraphemeCellWidth(segment);
    if (rowWidth > 0 && rowWidth + cellWidth > widthLimit) {
      measuredWidth = Math.max(measuredWidth, rowWidth);
      rowWidth = 0;
      rows += 1;
    }
    rowWidth += cellWidth;
  }
  measuredWidth = Math.max(measuredWidth, rowWidth);
  return {
    width: constrained ? Math.min(widthLimit, measuredWidth) : measuredWidth,
    height: rows,
  };
};

const configureNode = (node: WidgetNode, target: YogaNode): void => {
  const item = isCollectionItemKind(node.kind);
  const row = node.kind === "tabs" || node.kind === "grid-row";
  const column = node.kind === "list"
    || node.kind === "menu"
    || node.kind === "tree"
    || node.kind === "grid";
  const defaults: CellLayoutStyle = item
    ? {
        direction: "row",
        minHeight: node.kind === "tab" ? 2 : 1,
        flexShrink: 0,
        paddingLeft: node.kind === "tree-item"
          ? 2 + Math.max(0, (node.level ?? 1) - 1) * 2
          : node.kind === "list-item" || node.kind === "menu-item"
            ? 0
            : 1,
      }
    : node.kind === "button"
      ? {
          direction: "row",
          minHeight: 1,
          flexShrink: 0,
          paddingLeft: 1,
          paddingRight: 1,
        }
    : row
      ? { direction: "row", flexShrink: 0 }
    : column
      ? { direction: "column", flexShrink: 0 }
      : node.kind === "text-input"
        ? { minHeight: 1, flexShrink: 0 }
        : node.kind === "text-area"
          ? { minHeight: 3, flexShrink: 0 }
          : {};
  applyStyle(target, { ...defaults, ...node.style });
  // The last inner row belongs to Tab chrome, in addition to user padding.
  target.setPadding(Edge.Bottom, node.kind === "tab" ? (node.style.padding ?? 0) + 1 : undefined);
  if (node.kind === "overlay") {
    target.setPositionType(PositionType.Absolute);
    target.setPosition(Edge.Left, node.overlayPosition?.x ?? 0);
    target.setPosition(Edge.Top, node.overlayPosition?.y ?? 0);
  }
  if (node.kind === "scroll-area") target.setOverflow(Overflow.Hidden);
  if (node.kind === "text") {
    target.setMeasureFunc((width, widthMode) => measureText(node.text ?? "", width, widthMode));
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
      configureNode(widget, node);
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
    root.calculateLayout(viewport.width, viewport.height, Direction.LTR);
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
