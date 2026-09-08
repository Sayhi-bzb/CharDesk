/* eslint-disable react-refresh/only-export-components */
import {
  alignCharDeskCanvasRect,
  CELL_GRAPHICS_VERSION,
  drawCharDeskCanvasRange,
  resolveCharDeskCanvasGlyphSource,
  getCharDeskCanvasFont,
  loadCharDeskCanvasFonts,
  presentCharDeskCellFrame,
  prepareCharDeskCanvasSurface,
  resolveCharDeskCanvasFontFace,
  type CharDeskCanvasPalette,
  type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import { cellRectContainsPoint } from "@chardesk/cell-core";
import {
  createCharDeskRectRangeGeometry,
  resolveCharDeskFontRoute,
  type CharDeskCellMetrics,
  type CharDeskCellRangePhase,
} from "@chardesk/rendering";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  FocusManager,
  commandForInput,
  dismissCommandForFocusExit,
  primarySemanticAction,
  textEditorAtPoint,
  resolveWheelInput,
  type WidgetCommand,
} from "./interaction.js";
import { EventManager, type CellEventHandlerMap } from "./events.js";
import { getEventPath, hitTestCell } from "./scene.js";
import { useSurfaceFocus } from "./browser-focus.js";
import { useCellFontMetrics } from "./browser-font-metrics.js";
import { createCellUiFontProfile } from "./browser-font-profile.js";
import { useCellFontAudit } from "./browser-font-audit.js";
export { DEFAULT_CELL_UI_METRICS, loadCellFontMetrics } from "./browser-font-metrics.js";
import {
  GestureManager,
  type GestureSignal,
} from "./gestures.js";
import { CellTextInputLayer } from "./browser-input.js";
import { keyInputFromKeyboardEvent } from "@chardesk/keyboard/browser";
import { isCellKeyPress } from "./keyboard.js";
import { useCellRangeState } from "./browser-range.js";
import { offsetAtCellPoint } from "./text.js";
import {
  createCellRangeSnapshot,
  equalCellRangeSnapshot,
  type CellRangeCommand,
  type CellRangeSnapshot,
} from "./range.js";
import type { RootProps } from "./react.js";
import { captureCellProbe, formatCellBuffer } from "./probe.js";
import type { CellProbePresentation, CellProbeSnapshot } from "./probe.js";
import { CellUiRuntime } from "./runtime.js";
import { createCellUiRenderFrame } from "./frame.js";
import { textViewportCommands } from "./text-viewport.js";
import { usePointerAppearance } from "./browser-hover.js";
import { CellCursorPresenter } from "./browser-cursor.js";
import { sameWidgetValue } from "./tree.js";
import {
  commandForGestureSignal,
  gestureCandidatesForFrame,
  validGestureCandidate,
} from "./pointer.js";
import { resolveCellUiTheme, type CellUiTheme } from "./theme.js";
export { readCellCssTheme, useCellCssTheme } from "./browser-theme.js";
export type { CellCssTheme } from "./browser-theme.js";
import { FixedVirtualGrid, type VirtualRange } from "./virtual.js";
import type { CellListItem } from "./browser-collections.js";
import type {
  CellPoint,
  CellRect,
  CellSize,
  FrameSnapshot,
  SemanticNode,
  SemanticAction,
  SemanticSnapshot,
  WidgetId,
} from "./types.js";

export { useCellTextState } from "./browser-input.js";
export type { CellTextState } from "./browser-input.js";
export { keyInputFromKeyboardEvent } from "@chardesk/keyboard/browser";
export { useCellRangeState } from "./browser-range.js";
export type { CellRangeState } from "./browser-range.js";
export {
  useCellGridState,
  useCellListState,
  useCellMenuState,
  useCellSelectState,
  useCellTabsState,
  useCellTreeState,
} from "./browser-collections.js";
export type {
  CellGridCell,
  CellGridRow,
  CellGridState,
  CellListItem,
  CellListState,
  CellMenuState,
  CellSelectItem,
  CellSelectState,
  CellTabItem,
  CellTabsState,
  CellTreeItem,
  CellTreeRow,
  CellTreeState,
} from "./browser-collections.js";

export type CellVirtualListRow<Item extends CellListItem> = Readonly<{
  item: Item;
  index: number;
}>;

const nearestEnabledItemIndex = <Item extends CellListItem>(
  items: readonly Item[],
  desired: number,
  range: VirtualRange,
  direction: -1 | 1
): number | null => {
  if (range.start >= range.end) return null;
  const start = Math.max(range.start, Math.min(range.end - 1, desired));
  for (let index = start; index >= range.start && index < range.end; index += direction) {
    if (!items[index]?.disabled) return index;
  }
  for (let index = start - direction; index >= range.start && index < range.end; index -= direction) {
    if (!items[index]?.disabled) return index;
  }
  return null;
};

export type CellVirtualListState<Item extends CellListItem> = Readonly<{
  rows: readonly CellVirtualListRow<Item>[];
  focusedId: WidgetId | null;
  selectedId: WidgetId | null;
  scrollY: number;
  totalHeight: number;
  paddingTop: number;
  rowHeight: number;
  mountedCount: number;
  cacheRange: VirtualRange;
  dispatch: (command: WidgetCommand) => void;
  reveal: (
    id: WidgetId,
    align?: "nearest" | "start" | "center" | "end"
  ) => void;
}>;

export const useCellVirtualListState = <Item extends CellListItem>(
  items: readonly Item[],
  options: Readonly<{
    scrollId: WidgetId;
    viewportRows: number;
    rowHeight?: number;
    overscanRows?: number;
    defaultFocusedId?: WidgetId;
    defaultSelectedId?: WidgetId;
    onAction?: (id: WidgetId) => void;
  }>
): CellVirtualListState<Item> => {
  const [rowHeight] = useState(options.rowHeight ?? 1);
  const [provider] = useState(() => new FixedVirtualGrid({
    rows: items,
    columnCount: 1,
    getRowKey: (item: Item) => item.id,
    viewport: { width: 1, height: options.viewportRows },
    rowHeight,
    overscanRows: options.overscanRows,
    overscanColumns: 0,
  }));
  const itemsRef = useRef(items);
  const viewportRowsRef = useRef(options.viewportRows);
  const [focusedId, setFocusedId] = useState<WidgetId | null>(
    options.defaultFocusedId ?? options.defaultSelectedId ?? null
  );
  const [selectedId, setSelectedId] = useState<WidgetId | null>(
    options.defaultSelectedId ?? null
  );

  useLayoutEffect(() => {
    if (itemsRef.current !== items) {
      provider.setRows(items);
      itemsRef.current = items;
    }
    if (viewportRowsRef.current !== options.viewportRows) {
      provider.setViewport({ width: 1, height: options.viewportRows });
      viewportRowsRef.current = options.viewportRows;
    }
  }, [items, options.viewportRows, provider]);
  const snapshot = useSyncExternalStore(
    useCallback((listener) => provider.subscribe(listener), [provider]),
    useCallback(() => provider.snapshot(), [provider]),
    useCallback(() => provider.snapshot(), [provider])
  );
  const reveal = useCallback((
    id: WidgetId,
    align: "nearest" | "start" | "center" | "end" = "nearest"
  ) => {
    provider.reveal(id, 0, align);
  }, [provider]);
  const dispatch = useCallback((command: WidgetCommand) => {
    if (command.type === "scroll" && command.targetId === options.scrollId) {
      const next = provider.scrollTo({ x: command.scrollX, y: command.scrollY });
      const currentIndex = focusedId
        ? itemsRef.current.findIndex((item) => item.id === focusedId)
        : -1;
      if (currentIndex < 0) return;
      const direction = command.page?.direction
        ?? (currentIndex < next.visibleRows.start ? 1 : -1);
      const desired = command.page
        ? currentIndex + direction * Math.max(1, Math.floor(command.page.cellCount / rowHeight))
        : currentIndex < next.visibleRows.start
          ? next.visibleRows.start
          : currentIndex >= next.visibleRows.end
            ? next.visibleRows.end - 1
            : currentIndex;
      if (desired === currentIndex && !itemsRef.current[currentIndex]?.disabled) return;
      const searchRange = command.page
        ? { start: 0, end: itemsRef.current.length }
        : next.visibleRows;
      const targetIndex = nearestEnabledItemIndex(
        itemsRef.current,
        desired,
        searchRange,
        direction
      );
      if (targetIndex === null) return;
      const target = itemsRef.current[targetIndex]!;
      setFocusedId(target.id);
      if (targetIndex < next.visibleRows.start || targetIndex >= next.visibleRows.end) {
        provider.reveal(target.id, 0, direction > 0 ? "end" : "start");
      }
      return;
    }
    if (command.type !== "focus" && command.type !== "activate") return;
    if (!itemsRef.current.some((item) => item.id === command.targetId)) return;
    setFocusedId(command.targetId);
    if (command.type === "focus" && command.reveal?.targetId === options.scrollId) {
      provider.scrollTo({ x: command.reveal.scrollX, y: command.reveal.scrollY });
    }
    if (command.type === "activate") {
      setSelectedId(command.targetId);
      options.onAction?.(command.targetId);
    }
  }, [focusedId, options, provider, rowHeight]);

  return {
    rows: snapshot.cells
      .filter((cell) => cell.columnIndex === 0 && !cell.keptAlive)
      .map((cell) => ({ item: cell.row, index: cell.rowIndex })),
    focusedId,
    selectedId,
    scrollY: snapshot.scrollOffset.y,
    totalHeight: snapshot.contentSize.height,
    paddingTop: snapshot.cacheRows.start * rowHeight,
    rowHeight,
    mountedCount: snapshot.mountedCount,
    cacheRange: snapshot.cacheRows,
    dispatch,
    reveal,
  };
};

export const pxToCellPoint = (
  point: Readonly<{ clientX: number; clientY: number }>,
  bounds: Pick<DOMRect, "left" | "top">,
  metrics: Pick<CharDeskCellMetrics, "cellWidth" | "cellHeight">
): CellPoint => ({
  x: Math.floor((point.clientX - bounds.left) / metrics.cellWidth),
  y: Math.floor((point.clientY - bounds.top) / metrics.cellHeight),
});

export const pxToCellPosition = (
  point: Readonly<{ clientX: number; clientY: number }>,
  bounds: Pick<DOMRect, "left" | "top">,
  metrics: Pick<CharDeskCellMetrics, "cellWidth" | "cellHeight">
): CellPoint => ({
  x: (point.clientX - bounds.left) / metrics.cellWidth,
  y: (point.clientY - bounds.top) / metrics.cellHeight,
});

const presentFrame = (
  canvas: HTMLCanvasElement,
  frame: FrameSnapshot,
  metrics: CharDeskCellMetrics,
  palette: CharDeskCanvasPalette,
  cellRange: CellRangeSnapshot | null,
  rangePhase: CharDeskCellRangePhase,
  theme: CellUiTheme,
  fontProfile?: CharDeskFontProfile,
  glyphOverflow: "clip" | "visible" = "clip",
  dirtyRegions?: readonly CellRect[]
): void => {
  const context = canvas.getContext("2d");
  if (!context) return;
  // Unbounded ink can touch any Cell: partial erasure cannot safely restore it.
  if (glyphOverflow === "visible") dirtyRegions = undefined;
  const width = frame.buffer.width * metrics.cellWidth;
  const height = frame.buffer.height * metrics.cellHeight;
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const resized = canvas.width !== Math.round(width * dpr)
    || canvas.height !== Math.round(height * dpr);
  const regions = dirtyRegions === undefined || resized
    ? [frame.scene.viewport]
    : dirtyRegions;
  if (dirtyRegions === undefined || resized) {
    prepareCharDeskCanvasSurface(canvas, context, width, height, dpr);
  } else {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (regions.length === 0) return;
  context.fillStyle = palette.background;
  for (const region of regions) {
    const bounds = alignCharDeskCanvasRect({
      x: region.x * metrics.cellWidth, y: region.y * metrics.cellHeight,
      width: region.width * metrics.cellWidth, height: region.height * metrics.cellHeight,
    }, context.getTransform());
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  presentCharDeskCellFrame(
    context,
    createCellUiRenderFrame(frame, regions),
    {
      metrics,
      palette,
      clipToCell: glyphOverflow === "clip",
      ...(fontProfile ? { fontProfile } : {}),
    }
  );
  if (cellRange) {
    drawCharDeskCanvasRange(context, {
      geometry: createCharDeskRectRangeGeometry(cellRange.bounds),
      phase: rangePhase,
      style: theme.rangeStyle,
      options: { metrics, clipRegions: regions },
    });
  }
};

const presentFrameWithCursor = (
  cursor: CellCursorPresenter,
  canvas: HTMLCanvasElement,
  frame: FrameSnapshot,
  metrics: CharDeskCellMetrics,
  palette: CharDeskCanvasPalette,
  cellRange: CellRangeSnapshot | null,
  rangePhase: CharDeskCellRangePhase,
  theme: CellUiTheme,
  fontProfile?: CharDeskFontProfile,
  glyphOverflow: "clip" | "visible" = "clip",
  dirtyRegions?: readonly CellRect[]
) => {
  cursor.beforeBasePresent();
  presentFrame(
    canvas,
    frame,
    metrics,
    palette,
    cellRange,
    rangePhase,
    theme,
    fontProfile,
    glyphOverflow,
    dirtyRegions
  );
  if (!cellRange) {
    cursor.afterBasePresent({
      frame,
      metrics,
      palette,
      style: theme.cursorStyle,
      ...(fontProfile ? { fontProfile } : {}),
    });
  }
};

const hiddenSemanticStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

export const SemanticDom = ({
  snapshot,
  onAction,
  showFocus,
}: Readonly<{
  snapshot: SemanticSnapshot;
  onAction: (targetId: WidgetId, action: SemanticAction) => void;
  showFocus?: () => void;
}>) => {
  const childrenByParent = useMemo(() => {
    const index = new Map<WidgetId, SemanticNode[]>();
    for (const node of snapshot.nodes.values()) {
      if (node.hidden || node.semanticParentId === null) continue;
      const children = index.get(node.semanticParentId);
      if (children) children.push(node);
      else index.set(node.semanticParentId, [node]);
    }
    for (const children of index.values()) {
      children.sort((left, right) => left.traversalOrder - right.traversalOrder);
    }
    return index;
  }, [snapshot]);
  const childrenOf = (parentId: WidgetId) => childrenByParent.get(parentId) ?? [];
  const renderNode = (node: SemanticNode): ReactNode => {
    if (node.role === "textbox") return null;
    const children = childrenOf(node.id);
    const focusable = node.actions.includes("focus");
    const primaryAction = primarySemanticAction(node);
    return (
      <div
        id={`cell-semantic-${node.id}`}
        key={node.id}
        role={node.role}
        aria-label={node.labelledById ? undefined : node.label}
        aria-labelledby={node.labelledById
          ? `cell-semantic-${node.labelledById}`
          : undefined}
        aria-controls={node.controlsId
          ? `cell-semantic-${node.controlsId}`
          : undefined}
        aria-activedescendant={node.activeDescendantId
          ? `cell-semantic-${node.activeDescendantId}`
          : undefined}
        aria-selected={node.selected}
        aria-expanded={node.expanded}
        aria-haspopup={node.hasPopup}
        aria-disabled={node.disabled || undefined}
        aria-modal={node.role === "dialog" && node.modal ? true : undefined}
        aria-orientation={node.orientation}
        aria-level={node.level}
        aria-rowindex={node.rowIndex}
        aria-colindex={node.columnIndex}
        aria-rowcount={node.rowCount}
        aria-colcount={node.columnCount}
        aria-posinset={node.positionInSet}
        aria-setsize={node.setSize}
        aria-checked={node.checked}
        aria-valuenow={node.valueNow}
        aria-valuemin={node.valueMin}
        aria-valuemax={node.valueMax}
        aria-valuetext={node.valueText}
        data-focused={snapshot.focusedId === node.id || undefined}
        data-cell-semantic-id={node.id}
        tabIndex={focusable ? -1 : undefined}
        onFocus={focusable
          ? () => {
              showFocus?.();
              if (snapshot.focusedId !== node.id) {
                onAction(node.id, "focus");
              }
            }
          : undefined}
        onClick={primaryAction
          ? () => onAction(node.id, primaryAction)
          : undefined}
      >
        {children.length > 0 ? children.map(renderNode) : node.label}
      </div>
    );
  };
  const roots = snapshot.roots
    .map((id) => snapshot.nodes.get(id))
    .filter((node): node is SemanticNode => node !== undefined && !node.hidden);
  return (
    <div style={hiddenSemanticStyle} data-semantic-revision={snapshot.revision}>
      {roots.map(renderNode)}
    </div>
  );
};

export type CellSurfaceProps = Readonly<{
  viewport: CellSize;
  children: ReactElement<RootProps>;
  focusedId?: WidgetId | null;
  theme?: Partial<CellUiTheme>;
  metrics?: CharDeskCellMetrics;
  fontSize?: number;
  fontProfile?: CharDeskFontProfile;
  glyphOverflow?: "clip" | "visible";
  palette?: CharDeskCanvasPalette;
  label?: string;
  className?: string;
  probeId?: string;
  fontAudit?: boolean;
  onCommand: (command: WidgetCommand) => void;
  cellRange?: CellRangeSnapshot | null;
  onCellRangeCommand?: (command: CellRangeCommand) => void;
}>;

export const CELL_SURFACE_PROBE_PROPERTY = "__chardeskCellProbeV3" as const;

type CellProbeHost = HTMLElement & {
  [CELL_SURFACE_PROBE_PROPERTY]?: CellProbeSnapshot;
};

export const readCellSurfaceProbe = (element: Element): CellProbeSnapshot | null => {
  const surface = element.matches("[data-cell-probe]")
    ? element
    : element.closest("[data-cell-probe]");
  return surface
    ? (surface as CellProbeHost)[CELL_SURFACE_PROBE_PROPERTY] ?? null
    : null;
};

const CELL_PROBE_FONT_SAMPLES = {
  display: "A",
  "cell-glyph": "─",
  cjk: "界",
  nerd: "\ue0b0",
  symbol: "∞",
  emoji: "👋",
} as const;

const roundProbePixels = (value: number) => Math.round(value * 1000) / 1000;

const captureCellProbePresentation = (
  frame: FrameSnapshot,
  canvas: HTMLCanvasElement,
  metrics: CharDeskCellMetrics,
  fontProfile?: CharDeskFontProfile
): CellProbePresentation => {
  const requestedFontRoutes = Object.fromEntries(
    Object.entries(CELL_PROBE_FONT_SAMPLES).filter(([, text]) => resolveCharDeskCanvasGlyphSource(text) === "font").map(([capability, grapheme]) => {
      const face = resolveCharDeskCanvasFontFace({
        grapheme,
        route: resolveCharDeskFontRoute(grapheme),
        bold: false,
        italic: false,
        ...(fontProfile ? { fontProfile } : {}),
      });
      return [capability, {
        family: face.family,
        fontSize: metrics.fontSize * face.fontSizeScale,
        scaleX: face.scaleX,
        baselineShiftEm: face.baselineShiftEm,
        boldStrategy: face.boldStrategy,
        boldOverdrawEm: face.boldOverdrawEm,
      }];
    })
  ) as CellProbePresentation["requestedFontRoutes"];
  const context = canvas.getContext("2d");
  const glyphOverflow: Array<CellProbePresentation["glyphOverflow"][number]> = [];
  const graphicCells: NonNullable<CellProbePresentation["cellGraphics"]>["cells"][number][] = [];
  if (context && typeof context.measureText === "function") {
    const measured = new Set<string>();
    context.save();
    try {
      for (let row = 0; row < frame.buffer.height; row += 1) {
        for (let col = 0; col < frame.buffer.width; col += 1) {
          const cell = frame.buffer.get(col, row);
          if (!cell || cell.continuation || !cell.text.trim()) continue;
          if (resolveCharDeskCanvasGlyphSource(cell.text) === "cell-graphics") {
            graphicCells.push({ text: cell.text, codePoint: cell.text.codePointAt(0)!, row, col,
              width: cell.width * metrics.cellWidth, height: metrics.cellHeight });
            continue;
          }
          const bold = !!cell.style.bold;
          const key = `${bold}:${cell.text}`;
          if (measured.has(key)) continue;
          measured.add(key);
          const route = resolveCharDeskFontRoute(cell.text);
          const face = resolveCharDeskCanvasFontFace({
            grapheme: cell.text,
            route,
            bold,
            italic: false,
            ...(fontProfile ? { fontProfile } : {}),
          });
          context.font = getCharDeskCanvasFont(metrics, 1, {
            bold,
            route,
            fontFamily: face.family,
            fontSizeScale: face.fontSizeScale,
            boldStrategy: face.boldStrategy,
          });
          const overdrawWidth = bold && face.boldStrategy === "overdraw"
            ? face.boldOverdrawEm * metrics.fontSize * face.fontSizeScale
            : 0;
          // A centered glyph shifted right needs matching allocation room on both sides.
          const measuredWidth = context.measureText(cell.text).width * face.scaleX + overdrawWidth * 2;
          const availableWidth = cell.width * metrics.cellWidth;
          if (measuredWidth <= availableWidth + 0.5) continue;
          glyphOverflow.push({
            text: cell.text,
            row,
            col,
            spanCells: cell.width,
            measuredWidth: roundProbePixels(measuredWidth),
            availableWidth: roundProbePixels(availableWidth),
          });
        }
      }
    } finally {
      context.restore();
    }
  }
  return {
    metrics: {
      cellWidth: metrics.cellWidth,
      cellHeight: metrics.cellHeight,
      fontSize: metrics.fontSize,
      ...(metrics.baseline === undefined ? {} : { baseline: metrics.baseline }),
    },
    fontProfileId: fontProfile?.id ?? "default",
    requestedFontRoutes,
    cellGraphics: { source: "cell-graphics", version: CELL_GRAPHICS_VERSION, cells: graphicCells },
    glyphOverflow,
  };
};

const isCellRangePointerChord = (event: Pick<PointerEvent, "altKey" | "metaKey">) => {
  const applePlatform = typeof navigator !== "undefined"
    && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return event.altKey && (!applePlatform || event.metaKey);
};

export const CellSurface = (props: CellSurfaceProps): ReactNode => {
  const {
    viewport,
    children,
    focusedId = null,
    theme,
    metrics: explicitMetrics,
    fontSize,
    fontProfile: requestedFontProfile,
    glyphOverflow = "clip",
    palette: paletteOverride,
    label = "Cell interface",
    className,
    probeId,
    fontAudit: auditFonts = false,
    onCommand,
    cellRange: controlledCellRange,
    onCellRangeCommand,
  } = props;
  const fontProfile = useMemo(() => createCellUiFontProfile(requestedFontProfile), [requestedFontProfile]);
  const fontMetrics = useCellFontMetrics(fontProfile, fontSize, explicitMetrics);
  const fontAudit = useCellFontAudit(
    !!probeId && auditFonts && fontMetrics.ready,
    fontProfile,
    fontMetrics.metrics
  );
  const { metrics } = fontMetrics;
  const resolvedTheme = useMemo(() => resolveCellUiTheme(theme), [theme]);
  const palette = useMemo(() => paletteOverride ?? {
    color: resolvedTheme.foreground, background: resolvedTheme.background,
  }, [paletteOverride, resolvedTheme]);
  const {
    snapshot: internalCellRange,
    dispatch: dispatchInternalCellRange,
  } = useCellRangeState();
  const rangeControlled = controlledCellRange !== undefined;
  const cellRange = rangeControlled ? controlledCellRange : internalCellRange;
  const rangeEditable = !rangeControlled || onCellRangeCommand !== undefined;
  const dispatchCellRange = useCallback((command: CellRangeCommand) => {
    if (!rangeControlled) dispatchInternalCellRange(command);
    onCellRangeCommand?.(command);
  }, [dispatchInternalCellRange, onCellRangeCommand, rangeControlled]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorPresenterRef = useRef<CellCursorPresenter | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CellUiRuntime | null>(null);
  const frameRef = useRef<FrameSnapshot | null>(null);
  const presentedRevisionRef = useRef<number | null>(null);
  const presentationRef = useRef({ metrics, palette, fontProfile, glyphOverflow });
  const focusRef = useRef(new FocusManager());
  const eventsRef = useRef(new EventManager());
  const gesturesRef = useRef(new GestureManager());
  const inputModalityRef = useRef<"keyboard" | "pointer">("keyboard");
  const surfaceFocus = useSurfaceFocus(surfaceRef);
  const ownsFocus = surfaceFocus.ownsFocus;
  const focusedIdRef = useRef<WidgetId | null | undefined>(undefined);
  const lifetimeRef = useRef<object | null>(null);
  const projectionRef = useRef<Readonly<{
    children: ReactElement<RootProps>;
    focusedId: WidgetId | null;
    hoveredId: WidgetId | null;
    theme: Partial<CellUiTheme> | undefined;
    interactionRevision: number;
    focusActive: boolean;
    width: number;
    height: number;
  }> | null>(null);
  const textDragRef = useRef<Readonly<{
    targetId: WidgetId;
    anchor: number;
    pointerId: number;
  }> | null>(null);
  const rangeDragRef = useRef<Readonly<{
    anchor: CellPoint;
    pointerId: number;
  }> | null>(null);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const [fontPresentationRevision, setFontPresentationRevision] = useState(0);
  const [frame, setFrame] = useState<FrameSnapshot | null>(null);
  const pointerAppearance = usePointerAppearance(canvasRef, frame, metrics);
  const { hoveredId } = pointerAppearance;

  useEffect(() => {
    const token = {};
    lifetimeRef.current = token;
    return () => {
      queueMicrotask(() => {
        if (lifetimeRef.current !== token) return;
        runtimeRef.current?.dispose();
        runtimeRef.current = null;
      });
    };
  }, []);

  useEffect(() => () => {
    cursorPresenterRef.current?.dispose();
    cursorPresenterRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const previousProjection = projectionRef.current;
    if (
      previousProjection?.children === children
      && previousProjection.focusedId === focusedId
      && previousProjection.hoveredId === hoveredId
      && previousProjection.theme === theme
      && previousProjection.interactionRevision === interactionRevision
      && previousProjection.focusActive === surfaceFocus.active
      && previousProjection.width === viewport.width
      && previousProjection.height === viewport.height
    ) return;

    let runtime = runtimeRef.current;
    if (!runtime) {
      runtime = new CellUiRuntime({ viewport, theme });
      runtimeRef.current = runtime;
    } else {
      runtime.resize(viewport);
      runtime.setTheme(theme);
    }
    const focusedChanged = focusedIdRef.current !== focusedId;
    const next = runtime.render(children, {
      hoveredId,
      focusVisible: surfaceFocus.active,
      resolveFocusedId: (tree) => {
        focusRef.current.sync(tree, focusedChanged ? focusedId : undefined);
        if (!focusRef.current.focusedId && focusedId && tree.nodes.has(focusedId)) {
          focusRef.current.sync(tree, focusedId);
        }
        return focusRef.current.focusedId;
      },
    });
    for (const pointerId of eventsRef.current.sync(next)) {
      gesturesRef.current.cancel(pointerId);
    }
    for (const pointerId of gesturesRef.current.sync((candidate) => validGestureCandidate(next, candidate))) {
      eventsRef.current.cancel(pointerId);
      const surface = surfaceRef.current;
      if (surface?.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
    }
    focusedIdRef.current = focusedId;
    for (const command of textViewportCommands(next)) onCommand(command);
    frameRef.current = next;
    projectionRef.current = {
      children,
      focusedId,
      hoveredId,
      theme,
      interactionRevision,
      focusActive: surfaceFocus.active,
      width: viewport.width,
      height: viewport.height,
    };
    // The headless runtime is an external store; publish its committed snapshot.
    setFrame(next);
  }, [children, focusedId, hoveredId, interactionRevision, onCommand, theme, viewport, surfaceFocus.active]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || frameRef.current !== frame) return;
    if (!sameWidgetValue(presentationRef.current.metrics, metrics)) {
      const pointerIds = new Set(gesturesRef.current.sync(() => false));
      if (rangeDragRef.current) pointerIds.add(rangeDragRef.current.pointerId);
      if (textDragRef.current) pointerIds.add(textDragRef.current.pointerId);
      rangeDragRef.current = null;
      textDragRef.current = null;
      for (const id of pointerIds) {
        eventsRef.current.cancel(id);
        if (surfaceRef.current?.hasPointerCapture(id)) surfaceRef.current.releasePointerCapture(id);
      }
    }
    const previousRevision = presentedRevisionRef.current;
    const incremental = previousRevision !== null && frame.revision > previousRevision
      && sameWidgetValue(presentationRef.current.metrics, metrics)
      && sameWidgetValue(presentationRef.current.palette, palette)
      && presentationRef.current.fontProfile === fontProfile
      && presentationRef.current.glyphOverflow === glyphOverflow;
    const cursor = cursorPresenterRef.current ??= new CellCursorPresenter(canvas);
    presentFrameWithCursor(
      cursor,
      canvas,
      frame,
      metrics,
      palette,
      cellRange,
      rangeDragRef.current ? "selecting" : "resting",
      resolvedTheme,
      fontProfile,
      glyphOverflow,
      incremental ? frame.invalidation.dirtyRegions : undefined
    );
    presentedRevisionRef.current = frame.revision;
    presentationRef.current = { metrics, palette, fontProfile, glyphOverflow };
  }, [cellRange, fontProfile, frame, metrics, palette, resolvedTheme, glyphOverflow]);

  const fontPresentRef = useRef<() => void>(() => undefined);
  const scheduleFontPresentRef = useRef<() => void>(() => undefined);
  const requestedFontsRef = useRef(new Set<string>());
  useLayoutEffect(() => {
    fontPresentRef.current = () => {
      const canvas = canvasRef.current;
      const current = frameRef.current;
      if (canvas && current) {
        const cursor = cursorPresenterRef.current ??= new CellCursorPresenter(canvas);
        presentFrameWithCursor(
          cursor,
          canvas,
          current,
          metrics,
          palette,
          cellRange,
          rangeDragRef.current ? "selecting" : "resting",
          resolvedTheme,
          fontProfile,
          glyphOverflow
        );
        setFontPresentationRevision((revision) => revision + 1);
      }
    };
  }, [metrics, palette, cellRange, resolvedTheme, fontProfile, glyphOverflow]);
  useEffect(() => {
    requestedFontsRef.current.clear();
  }, [fontProfile]);
  useEffect(() => {
    if (!frame || !document.fonts) return;
    const samples: { grapheme: string; bold: boolean }[] = [];
    for (let y = 0; y < frame.buffer.height; y++) {
      for (let x = 0; x < frame.buffer.width; x++) {
        const cell = frame.buffer.get(x, y);
        if (!cell || cell.continuation || !cell.text.trim()) continue;
        const bold = !!cell.style.bold;
        const key = `${bold}:${cell.text}`;
        if (requestedFontsRef.current.has(key)) continue;
        requestedFontsRef.current.add(key);
        samples.push({ grapheme: cell.text, bold });
      }
    }
    if (!samples.length) return;
    // Explicit loads also cover engines that omit FontFaceSet loading events.
    void loadCharDeskCanvasFonts(samples, {
      metrics,
      ...(fontProfile ? { fontProfile } : {}),
    }).then(() => {
      scheduleFontPresentRef.current();
    });
  }, [fontProfile, frame, metrics]);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let active = true;
    let pending: number | null = null;
    const schedule = () => {
      if (!active || pending !== null) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        if (active) fontPresentRef.current();
      });
    };
    scheduleFontPresentRef.current = schedule;
    fonts.addEventListener("loadingdone", schedule);
    void fonts.ready.then(schedule, () => undefined);
    return () => {
      active = false;
      fonts.removeEventListener("loadingdone", schedule);
      if (pending !== null) cancelAnimationFrame(pending);
    };
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current as CellProbeHost | null;
    if (!surface || !probeId || !frame) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snapshot: CellProbeSnapshot = {
      ...captureCellProbe(frame, { probeId }),
      presentation: {
        ...captureCellProbePresentation(frame, canvas, metrics, fontProfile),
        measurement: { source: fontMetrics.source, ready: fontMetrics.ready },
        ...(auditFonts ? { fontAudit } : {}),
        glyphOverflowMode: glyphOverflow,
      },
    };
    surface[CELL_SURFACE_PROBE_PROPERTY] = snapshot;
    return () => {
      if (surface[CELL_SURFACE_PROBE_PROPERTY] === snapshot) {
        delete surface[CELL_SURFACE_PROBE_PROPERTY];
      }
    };
  }, [auditFonts, fontPresentationRevision, fontProfile, frame, metrics, probeId, fontMetrics, fontAudit, glyphOverflow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const cursor = cursorPresenterRef.current ??= new CellCursorPresenter(canvas);
      presentFrameWithCursor(
        cursor,
        canvas,
        frame,
        metrics,
        palette,
        cellRange,
        rangeDragRef.current ? "selecting" : "resting",
        resolvedTheme,
        fontProfile,
        glyphOverflow
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [cellRange, fontProfile, frame, metrics, palette, resolvedTheme, glyphOverflow]);

  useEffect(() => {
    if (!frame || !cellRange || !rangeEditable) return;
    const next = createCellRangeSnapshot(frame.buffer, cellRange.anchor, cellRange.head);
    if (!equalCellRangeSnapshot(cellRange, next)) {
      dispatchCellRange(next ? { type: "set", snapshot: next } : { type: "clear" });
    }
  }, [cellRange, dispatchCellRange, frame, rangeEditable]);

  const syncDomFocus = useCallback(() => {
    const surface = surfaceRef.current;
    const targetId = frame?.semantics.focusedId;
    if (!surface || !targetId || inputModalityRef.current !== "keyboard") return;
    if (!ownsFocus()) return;
    const active = document.activeElement;
    const semanticTarget = [...surface.querySelectorAll<HTMLElement>("[data-cell-semantic-id]")]
      .find((element) => element.dataset.cellSemanticId === targetId);
    const textTarget = [...surface.querySelectorAll<HTMLTextAreaElement>("textarea[data-cell-text-editor]")]
      .find((textarea) => textarea.dataset.cellTextEditor === targetId);
    const target = textTarget ?? semanticTarget;
    if (target && active !== target) target.focus({ preventScroll: true });
  }, [frame, ownsFocus]);

  useLayoutEffect(syncDomFocus, [syncDomFocus]);

  const dispatch = useCallback((command: WidgetCommand | null) => {
    if (!command) return;
    focusRef.current.apply(command);
    onCommand(command);
    setInteractionRevision((value) => value + 1);
  }, [onCommand]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      const current = frameRef.current;
      if (!current || event.ctrlKey) return;
      const result = resolveWheelInput(current, {
        type: "wheel",
        point: pxToCellPoint(event, canvas.getBoundingClientRect(), metrics),
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      if (result.consumed) event.preventDefault();
      dispatch(result.command);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [dispatch, metrics]);

  const textDragPointFor = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    return bounds ? pxToCellPoint(event, bounds, metrics) : null;
  };

  const setCellRange = (anchor: CellPoint, head: CellPoint) => {
    if (!frame || !rangeEditable) return;
    const snapshot = createCellRangeSnapshot(frame.buffer, anchor, head);
    dispatchCellRange(snapshot ? { type: "set", snapshot } : { type: "clear" });
  };

  const applyGestureSignals = (
    current: FrameSnapshot,
    signals: readonly GestureSignal[]
  ) => {
    for (const signal of signals) {
      dispatch(commandForGestureSignal(current, signal, focusRef.current));
    }
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    const { pointerId, currentTarget } = event;
    eventsRef.current.cancel(pointerId);
    gesturesRef.current.cancel(pointerId);
    if (rangeDragRef.current?.pointerId === pointerId) rangeDragRef.current = null;
    if (textDragRef.current?.pointerId === pointerId) textDragRef.current = null;
    if (currentTarget.hasPointerCapture(pointerId)) currentTarget.releasePointerCapture(pointerId);
  };

  const focusTextarea = (targetId: WidgetId) => {
    const textareas = canvasRef.current?.parentElement?.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-cell-text-editor]"
    );
    [...(textareas ?? [])]
      .find((textarea) => textarea.dataset.cellTextEditor === targetId)
      ?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    inputModalityRef.current = "keyboard";
    const input = keyInputFromKeyboardEvent(event.nativeEvent);
    if (isCellKeyPress(input, "Escape") && cellRange && rangeEditable) {
      event.preventDefault();
      dispatchCellRange({ type: "clear" });
      return;
    }
    if (
      !frame
      || (event.target instanceof HTMLTextAreaElement && event.key !== "Escape")
    ) return;
    const command = commandForInput(input, frame, focusRef.current);
    if (command) {
      event.preventDefault();
      dispatch(command);
    }
  };

  const onSurfaceBlur = (event: FocusEvent<HTMLDivElement>) => {
    surfaceFocus.leave(event);
    const surface = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && surface.contains(relatedTarget)) return;
    if (!surface.ownerDocument.hasFocus()) return;
    const confirmExit = () => {
      const current = frameRef.current;
      if (current) dispatch(dismissCommandForFocusExit(current));
      if (cellRange && rangeEditable) dispatchCellRange({ type: "clear" });
    };
    if (relatedTarget) {
      confirmExit();
      return;
    }
    // A null relatedTarget can mean either page chrome or a transient browser/
    // React focus gap. Wait for the document to expose its settled owner.
    queueMicrotask(() => {
      const document = surface.ownerDocument;
      if (
        surface.isConnected
        && document.hasFocus()
        && !surface.contains(document.activeElement)
      ) confirmExit();
    });
  };

  return (
    <div
      ref={surfaceRef}
      className={className}
      tabIndex={0}
      aria-label={label}
      data-cell-probe={probeId}
      data-cell-range={cellRange
        ? `${cellRange.bounds.x},${cellRange.bounds.y},${cellRange.bounds.width},${cellRange.bounds.height}`
        : undefined}
      data-cell-focused={frame?.semantics.focusedId ?? undefined}
      data-cell-hovered={hoveredId ?? undefined}
      data-cell-focus-visible={surfaceFocus.active && frame?.semantics.focusedId ? true : undefined}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        pointerAppearance.suspend();
        if (event.button !== 0) return;
        inputModalityRef.current = "pointer";
        if (!frame) return;
        const point = textDragPointFor(event);
        if (!point) return;
        if (isCellRangePointerChord(event) && rangeEditable) {
          event.preventDefault();
          rangeDragRef.current = { anchor: point, pointerId: event.pointerId };
          textDragRef.current = null;
          event.currentTarget.setPointerCapture(event.pointerId);
          setCellRange(point, point);
          event.currentTarget.focus({ preventScroll: true });
          return;
        }
        if (cellRange && rangeEditable) dispatchCellRange({ type: "clear" });
        if (event.target !== canvasRef.current) return;
        const editor = textEditorAtPoint(frame, point);
        const textLayout = editor ? frame.textLayouts.get(editor.id) : undefined;
        const hitPart = hitTestCell(frame.scene, point)?.part;
        const onScrollbar = hitPart === "scrollbar-x" || hitPart === "scrollbar-y" || hitPart === "scrollbar-corner";
        if (editor && textLayout && !editor.disabled && !onScrollbar) {
          event.preventDefault();
          const contentClip = frame.scene.entries.get(editor.id)?.contentClip;
          if (contentClip && cellRectContainsPoint(contentClip, point)) {
            const offset = offsetAtCellPoint(textLayout, point);
            textDragRef.current = { targetId: editor.id, anchor: offset, pointerId: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
            dispatch({
              type: "text",
              targetId: editor.id,
              command: { type: "set-selection", anchor: offset },
            });
          } else {
            dispatch({ type: "focus", targetId: editor.id });
          }
          focusTextarea(editor.id);
          return;
        }
        const immediate = commandForInput(
          { type: "pointer", phase: "down", point, button: event.button },
          frame,
          focusRef.current
        );
        if (immediate?.type === "dismiss") {
          dispatch(immediate);
          event.currentTarget.focus({ preventScroll: true });
          return;
        }
        if (immediate?.type === "focus") dispatch(immediate);
        const targetId = eventsRef.current.resolveTarget(frame, point, event.pointerId);
        const bounds = canvasRef.current!.getBoundingClientRect();
        const precisePoint = pxToCellPosition(event, bounds, metrics);
        const candidates = gestureCandidatesForFrame(frame, targetId ? getEventPath(frame.scene, targetId) : [], point, precisePoint);
        const handlers: CellEventHandlerMap = targetId && candidates.length > 0
          ? new Map([[targetId, { bubble: (cellEvent) => cellEvent.capturePointer() }]])
          : new Map();
        eventsRef.current.dispatch(frame, {
          type: "pointer-down",
          pointerId: event.pointerId,
          point,
          button: event.button,
        }, handlers);
        if (candidates.length > 0) {
          event.preventDefault();
          gesturesRef.current.begin(event.pointerId, point, candidates, precisePoint);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (editor && !editor.disabled && onScrollbar) {
          dispatch({ type: "focus", targetId: editor.id });
          focusTextarea(editor.id);
        } else {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        pointerAppearance.move(event);
        const rangeDrag = rangeDragRef.current;
        const point = textDragPointFor(event);
        if (rangeDrag && rangeDrag.pointerId === event.pointerId && point) {
          setCellRange(rangeDrag.anchor, point);
          return;
        }
        const drag = textDragRef.current;
        if (!frame || !point) return;
        if (drag && drag.pointerId === event.pointerId) {
          const layout = frame.textLayouts.get(drag.targetId);
          if (!layout) return;
          dispatch({
            type: "text",
            targetId: drag.targetId,
            command: {
              type: "set-selection",
              anchor: drag.anchor,
              head: offsetAtCellPoint(layout, point),
            },
          });
          return;
        }
        if (!gesturesRef.current.has(event.pointerId)) return;
        eventsRef.current.dispatch(frame, {
          type: "pointer-move",
          pointerId: event.pointerId,
          point,
        });
        const bounds = canvasRef.current!.getBoundingClientRect();
        applyGestureSignals(frame, gesturesRef.current.move(event.pointerId, point, pxToCellPosition(event, bounds, metrics)));
      }}
      onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
        const gesture = gesturesRef.current.has(event.pointerId);
        const point = textDragPointFor(event);
        try {
          if (gesture && frame && point) {
            eventsRef.current.dispatch(frame, {
              type: "pointer-up",
              pointerId: event.pointerId,
              point,
            });
            const bounds = canvasRef.current!.getBoundingClientRect();
            applyGestureSignals(frame, gesturesRef.current.end(event.pointerId, point, pxToCellPosition(event, bounds, metrics)));
          }
        } finally {
          finishPointer(event);
          pointerAppearance.resume(event);
        }
      }}
      onPointerEnter={pointerAppearance.move}
      onPointerLeave={pointerAppearance.clear}
      onPointerCancel={(event) => { finishPointer(event); pointerAppearance.clear(); }}
      onLostPointerCapture={(event) => {
        const interrupted = eventsRef.current.capturedTarget(event.pointerId) !== null
          || gesturesRef.current.has(event.pointerId)
          || textDragRef.current?.pointerId === event.pointerId
          || rangeDragRef.current?.pointerId === event.pointerId;
        finishPointer(event);
        if (interrupted) pointerAppearance.clear();
      }}
      onCopy={(event: ClipboardEvent<HTMLDivElement>) => {
        if (event.defaultPrevented || !frame || !cellRange) return;
        const current = createCellRangeSnapshot(frame.buffer, cellRange.anchor, cellRange.head);
        if (!current) return;
        event.preventDefault();
        event.clipboardData.setData("text/plain", current.text);
        if (rangeEditable && !equalCellRangeSnapshot(cellRange, current)) {
          dispatchCellRange({ type: "set", snapshot: current });
        }
      }}
      onFocus={(event) => {
        surfaceFocus.enter();
        if (event.target === event.currentTarget) syncDomFocus();
        if (!frame || focusRef.current.focusedId) return;
        const targetId = focusRef.current.first(frame.tree);
        if (targetId) dispatch({ type: "focus", targetId });
      }}
      onBlur={onSurfaceBlur}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (
          event.defaultPrevented
          || !frame
          || (event.target instanceof HTMLTextAreaElement && event.key !== "Escape")
        ) return;
        const command = commandForInput(
          keyInputFromKeyboardEvent(event.nativeEvent),
          frame,
          focusRef.current
        );
        if (command) {
          event.preventDefault();
          dispatch(command);
        }
      }}
      style={{ position: "relative", width: "fit-content", outline: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{ cursor: pointerAppearance.cursor }}
        aria-hidden="true"
        data-cell-text={frame ? formatCellBuffer(frame.buffer, { trimEnd: true }) : undefined}
      />
      {frame ? (
        <SemanticDom
          snapshot={frame.semantics}
          onAction={(targetId, action) => {
            dispatch(commandForInput(
              { type: "semantic", targetId, action },
              frame,
              focusRef.current
            ));
          }}
          showFocus={() => {
            inputModalityRef.current = "keyboard";
          }}
        />
      ) : null}
      {frame ? (
        <CellTextInputLayer
          frame={frame}
          metrics={metrics}
          dispatch={dispatch}
          focusTarget={(targetId) => {
            if (focusRef.current.focusedId !== targetId) {
              dispatch({ type: "focus", targetId });
            }
          }}
        />
      ) : null}
    </div>
  );
};
