import type {
  CellPoint,
  CellRect,
  CellSize,
} from "@chardesk/cell-core";

export type { CellPoint, CellRect, CellSize } from "@chardesk/cell-core";

export type WidgetId = string;


export type CellInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

type FlexDirection = "row" | "column";

export type CellLayoutStyle = Readonly<{
  direction?: FlexDirection;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  minWidth?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  maxWidth?: number | `${number}%`;
  maxHeight?: number | `${number}%`;
  flexGrow?: number;
  flexShrink?: number;
  gap?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  border?: boolean;
}>;

export type CellTextStyle = Readonly<{
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}>;

export type WidgetKind =
  | "root"
  | "box"
  | "overlay"
  | "text"
  | "button"
  | "list"
  | "list-item"
  | "menu"
  | "menu-item"
  | "tree"
  | "tree-item"
  | "tabs"
  | "tab"
  | "tab-panel"
  | "grid"
  | "grid-row"
  | "grid-cell"
  | "scroll-area"
  | "text-input"
  | "text-area";

export type WidgetNode = Readonly<{
  id: WidgetId;
  key: string | null;
  kind: WidgetKind;
  parentId: WidgetId | null;
  index: number;
  style: CellLayoutStyle;
  text: string | null;
  textStyle: CellTextStyle;
  label: string | null;
  disabled: boolean;
  focused: boolean;
  focusVisible: boolean;
  hovered: boolean;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  level: number | null;
  parentItemId: WidgetId | null;
  rowIndex: number | null;
  columnIndex: number | null;
  rowCount: number | null;
  columnCount: number | null;
  positionInSet: number | null;
  setSize: number | null;
  orientation: "horizontal" | "vertical" | null;
  controlsId: WidgetId | null;
  labelledById: WidgetId | null;
  textEditor: import("./text.js").CellTextSnapshot | null;
  readOnly: boolean;
  overlayPosition: CellPoint | null;
  modal: boolean;
  scrollOffset: CellPoint;
  children: readonly WidgetId[];
}>;

export type WidgetTree = Readonly<{
  rootId: WidgetId | null;
  nodes: ReadonlyMap<WidgetId, WidgetNode>;
}>;

export type WidgetMutation =
  | Readonly<{ type: "mount"; id: WidgetId; parentId: WidgetId | null; index: number }>
  | Readonly<{ type: "update"; id: WidgetId }>
  | Readonly<{
      type: "move";
      id: WidgetId;
      fromParentId: WidgetId | null;
      toParentId: WidgetId | null;
      fromIndex: number;
      toIndex: number;
    }>
  | Readonly<{ type: "unmount"; id: WidgetId }>;

export type LayoutEntry = Readonly<{
  id: WidgetId;
  parentId: WidgetId | null;
  rect: CellRect;
  borderInsets: CellInsets;
  paddingInsets: CellInsets;
  contentRect: CellRect;
}>;

export type LayoutSnapshot = Readonly<{
  viewport: CellRect;
  entries: ReadonlyMap<WidgetId, LayoutEntry>;
}>;

export type SceneEntry = Readonly<{
  id: WidgetId;
  sceneParentId: WidgetId | null;
  eventParentId: WidgetId | null;
  layoutBounds: CellRect;
  decorationBounds: CellRect;
  contentBounds: CellRect;
  paintBounds: CellRect;
  hitBounds: CellRect;
  outerClip: CellRect;
  contentClip: CellRect;
  scrollMetrics: ScrollMetrics | null;
  layer: number;
  paintOrder: number;
  paintVisible: boolean;
}>;

export type ScrollMetrics = Readonly<{
  horizontalThumbAxis: HalfCellThumb | null;
  verticalThumbAxis: HalfCellThumb | null;
  viewport: CellRect;
  contentSize: CellSize;
  maxOffset: CellPoint;
  horizontalTrack: CellRect | null;
  verticalTrack: CellRect | null;
  horizontalThumb: CellRect | null;
  verticalThumb: CellRect | null;
  corner: CellRect | null;
}>;

export type HalfCellThumb = Readonly<{ start: number; length: number }>;

export type CellHitPart = "content" | "chrome" | "scrollbar-x" | "scrollbar-y" | "scrollbar-corner";

export type CellHit = Readonly<{
  ownerId: WidgetId;
  part: CellHitPart;
  point: CellPoint;
}>;

export type SceneSnapshot = Readonly<{
  viewport: CellRect;
  entries: ReadonlyMap<WidgetId, SceneEntry>;
  paintList: readonly WidgetId[];
}>;

export type FramePhase = "tree" | "layout" | "geometry" | "paint" | "semantics" | "present";

export type FrameInvalidation = Readonly<{
  phases: readonly FramePhase[];
  dirtyRegions: readonly CellRect[];
  work: Readonly<{
    layout: "computed" | "reused";
    geometry: "computed" | "reused";
    paint: "computed" | "reused";
    semantics: "computed" | "reused";
    present: "required" | "skipped";
  }>;
}>;

export type Cell = Readonly<{
  text: string;
  width: 1 | 2;
  continuation: boolean;
  ownerId: WidgetId | null;
  style: CellTextStyle;
}>;

export type SemanticAction = "activate" | "focus" | "expand" | "collapse";

export type SemanticNode = Readonly<{
  id: WidgetId;
  semanticParentId: WidgetId | null;
  traversalOrder: number;
  bounds: CellRect | null;
  role:
    | "dialog"
    | "button"
    | "listbox"
    | "option"
    | "textbox"
    | "menu"
    | "menuitem"
    | "tree"
    | "treeitem"
    | "tablist"
    | "tab"
    | "tabpanel"
    | "grid"
    | "row"
    | "gridcell";
  label: string;
  disabled: boolean;
  hidden: boolean;
  focused: boolean;
  selected?: boolean;
  expanded?: boolean;
  level?: number;
  rowIndex?: number;
  columnIndex?: number;
  rowCount?: number;
  columnCount?: number;
  positionInSet?: number;
  setSize?: number;
  orientation?: "horizontal" | "vertical";
  controlsId?: WidgetId;
  labelledById?: WidgetId;
  value?: string;
  multiline?: boolean;
  readOnly?: boolean;
  modal?: boolean;
  actions: readonly SemanticAction[];
  activeDescendantId?: WidgetId;
}>;

export type SemanticSnapshot = Readonly<{
  roots: readonly WidgetId[];
  nodes: ReadonlyMap<WidgetId, SemanticNode>;
  focusedId: WidgetId | null;
  revision: number;
}>;

export type FrameSnapshot = Readonly<{
  revision: number;
  tree: WidgetTree;
  layout: LayoutSnapshot;
  scene: SceneSnapshot;
  semantics: SemanticSnapshot;
  textLayouts: ReadonlyMap<WidgetId, import("./text.js").CellTextLayoutSnapshot>;
  buffer: import("./buffer.js").CellBuffer;
  mutations: readonly WidgetMutation[];
  invalidation: FrameInvalidation;
}>;
