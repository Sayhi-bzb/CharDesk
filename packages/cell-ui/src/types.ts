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
}>;

type CellSingleLineInputStyleKey = "width" | "minWidth" | "maxWidth" | "flexGrow" | "flexShrink";

export type CellSingleLineInputStyle = Readonly<
  Pick<CellLayoutStyle, CellSingleLineInputStyleKey>
  & { [Key in Exclude<keyof CellLayoutStyle, CellSingleLineInputStyleKey>]?: never }
>;

export type CellTextStyle = Readonly<{
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}>;

export type CellCheckboxState = boolean | "indeterminate";

export type WidgetKind =
  | "root"
  | "accordion"
  | "accordion-item"
  | "accordion-trigger"
  | "accordion-content"
  | "box"
  | "overlay"
  | "text"
  | "button"
  | "checkbox"
  | "toggle"
  | "progress"
  | "separator"
  | "radio-group"
  | "radio-item"
  | "slider"
  | "range-slider"
  | "range-slider-thumb"
  | "select"
  | "select-trigger"
  | "select-content"
  | "select-item"
  | "combobox"
  | "combobox-input"
  | "combobox-content"
  | "combobox-item"
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
  blockVariant: import("./border.js").CellBlockVariant;
  borderShape: import("./border.js").CellBorderShape | null;
  text: string | null;
  textStyle: CellTextStyle;
  label: string | null;
  disabled: boolean;
  focused: boolean;
  focusActive: boolean;
  focusVisible: boolean;
  hovered: boolean;
  manipulating: boolean;
  pressActive: boolean;
  activationFlash: boolean;
  confirming?: boolean;
  confirmation?: ConfirmationPresentation;
  selected: boolean;
  active: boolean;
  checked: CellCheckboxState;
  pressed: boolean;
  radioValue: string | null;
  progress: Readonly<{ value: number; max: number; valueText?: string }> | null;
  separatorVariant: import("./separator.js").SeparatorVariant;
  buttonVariant: import("./button.js").ButtonVariant;
  buttonSize: import("./button.js").ButtonSize;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  sliderValueText: string | null;
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
  activeDescendantId: WidgetId | null;
  labelledById: WidgetId | null;
  textEditor: import("./text.js").CellTextSnapshot | null;
  readOnly: boolean;
  overlayPosition: CellPoint | null;
  modal: boolean;
  dialog?: Readonly<{ initialFocusId?: string }>;
  dialogPart?: "title" | "description";
  closeOnOutsideClick?: boolean;
  describedById?: WidgetId;
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
  overlayViewport: CellRect;
  entries: ReadonlyMap<WidgetId, SceneEntry>;
  paintList: readonly WidgetId[];
}>;

export type CellOverlayPlane = Readonly<{
  rootId: WidgetId;
  bounds: CellRect;
  layer: number;
  paintOrder: number;
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
    | "heading"
    | "paragraph"
    | "region"
    | "button"
    | "checkbox"
    | "radio"
    | "radiogroup"
    | "progressbar"
    | "separator"
    | "slider"
    | "group"
    | "listbox"
    | "option"
    | "textbox"
    | "combobox"
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
  checked?: boolean | "mixed";
  pressed?: boolean;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
  expanded?: boolean;
  level?: number;
  rowIndex?: number;
  columnIndex?: number;
  rowCount?: number;
  columnCount?: number;
  positionInSet?: number;
  setSize?: number;
  orientation?: "horizontal" | "vertical";
  hasPopup?: "listbox";
  controlsId?: WidgetId;
  labelledById?: WidgetId;
  value?: string;
  multiline?: boolean;
  readOnly?: boolean;
  modal?: boolean;
  describedById?: WidgetId;
  actions: readonly SemanticAction[];
  activeDescendantId?: WidgetId;
}>;

export type SemanticSnapshot = Readonly<{
  roots: readonly WidgetId[];
  nodes: ReadonlyMap<WidgetId, SemanticNode>;
  focusedId: WidgetId | null;
  revision: number;
}>;

export type ConfirmationColors = Readonly<{ color: string; backgroundColor: string }>;
export type ConfirmationPresentation = Readonly<{
  sessionId: number;
  targetId: WidgetId;
  phase: number;
  reference: ConfirmationColors;
}>;

export type FrameSnapshot = Readonly<{
  colors: ConfirmationColors;
  confirmation?: ConfirmationPresentation;
  revision: number;
  tree: WidgetTree;
  layout: LayoutSnapshot;
  scene: SceneSnapshot;
  semantics: SemanticSnapshot;
  textLayouts: ReadonlyMap<WidgetId, import("./text.js").CellTextLayoutSnapshot>;
  baseBuffer: import("./buffer.js").CellBuffer;
  overlayBuffer: import("./buffer.js").CellBuffer;
  buffer: import("./buffer.js").CellBuffer;
  overlayPlanes: readonly CellOverlayPlane[];
  mutations: readonly WidgetMutation[];
  invalidation: FrameInvalidation;
}>;
