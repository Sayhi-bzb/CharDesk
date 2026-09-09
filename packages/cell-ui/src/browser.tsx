import { CellPresentationRegistry } from "./browser-presentation.js";
import { resolveCellFeedback, type CellFeedbackConfig } from "./feedback.js";
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
  commandForInput,
  dismissCommandForFocusExit,
  primarySemanticAction,
  revealCommandForTarget,
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
  type GestureSignal,
} from "./gestures.js";
import { CellInteractionController } from "./interaction-controller.js";
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
import type { CellBuffer } from "./buffer.js";
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
export { useCellRadioState } from "./browser-radio.js";
export type { CellRadioItem, CellRadioOptions } from "./browser-radio.js";
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

const sameWidgetIdSet = (left: ReadonlySet<WidgetId>, right: ReadonlySet<WidgetId>) =>
  left.size === right.size && [...left].every((id) => right.has(id));

export { useCellTextState } from "./browser-input.js";
export type { CellTextState } from "./browser-input.js";
export { filterCellComboboxItems, useCellComboboxState } from "./browser-combobox.js";
export type { CellComboboxItem, CellComboboxState } from "./browser-combobox.js";
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
  plane: Readonly<{
    buffer?: CellBuffer;
    viewport?: CellRect;
    transparent?: boolean;
  }> = {}
): void => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const buffer = plane.buffer ?? frame.buffer;
  const viewport = plane.viewport ?? frame.scene.viewport;
  const width = buffer.width * metrics.cellWidth;
  const height = buffer.height * metrics.cellHeight;
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const regions = [viewport];
  // Font ink may cross Cell boundaries, so presentation repaints the complete
  // Surface while the headless frame keeps its precise invalidation data.
  prepareCharDeskCanvasSurface(canvas, context, width, height, dpr);
  for (const region of regions) {
    const bounds = alignCharDeskCanvasRect({
      x: region.x * metrics.cellWidth, y: region.y * metrics.cellHeight,
      width: region.width * metrics.cellWidth, height: region.height * metrics.cellHeight,
    }, context.getTransform());
    if (plane.transparent) {
      context.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
      context.fillStyle = palette.background;
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }
  presentCharDeskCellFrame(
    context,
    createCellUiRenderFrame(frame, regions, { buffer, viewport }),
    {
      metrics,
      palette,
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
  fontProfile?: CharDeskFontProfile
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
    { buffer: frame.baseBuffer, viewport: frame.scene.viewport }
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
    if (node.role === "textbox" || node.role === "combobox") return null;
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
        aria-describedby={node.describedById ? `cell-semantic-${node.describedById}` : undefined}
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
        aria-pressed={node.pressed}
        aria-valuenow={node.valueNow}
        aria-valuemin={node.valueMin}
        aria-valuemax={node.valueMax}
        aria-valuetext={node.valueText}
        data-focused={snapshot.focusedId === node.id || undefined}
        data-cell-semantic-id={node.id}
        tabIndex={focusable ? -1 : undefined}
        onFocus={focusable
          ? (event) => {
              if (event.target !== event.currentTarget) return;
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
  overlayViewport?: CellSize;
  children: ReactElement<RootProps>;
  focusedId?: WidgetId | null;
  theme?: Partial<CellUiTheme>;
  feedback?: Partial<CellFeedbackConfig>;
  metrics?: CharDeskCellMetrics;
  fontSize?: number;
  fontProfile?: CharDeskFontProfile;
  palette?: CharDeskCanvasPalette;
  label?: string;
  className?: string;
  probeId?: string;
  fontAudit?: boolean;
  onCommand: (command: WidgetCommand) => void;
  cellRange?: CellRangeSnapshot | null;
  onCellRangeCommand?: (command: CellRangeCommand) => void;
}>;

export const CELL_SURFACE_PROBE_PROPERTY = "__chardeskCellProbeV5" as const;

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
        baselineShiftEm: face.baselineShiftEm,
        boldStrategy: face.boldStrategy,
        boldOverdrawEm: face.boldOverdrawEm,
      }];
    })
  ) as CellProbePresentation["requestedFontRoutes"];
  const context = canvas.getContext("2d");
  const glyphInkOverhang: Array<CellProbePresentation["glyphInkOverhang"][number]> = [];
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
          const measurement = context.measureText(cell.text);
          const halfAdvance = measurement.width / 2;
          const leftExtent = Number.isFinite(measurement.actualBoundingBoxLeft)
            ? measurement.actualBoundingBoxLeft
            : halfAdvance;
          const rightExtent = (Number.isFinite(measurement.actualBoundingBoxRight)
            ? measurement.actualBoundingBoxRight
            : halfAdvance) + overdrawWidth;
          const allocatedLeft = col * metrics.cellWidth;
          const allocatedRight = allocatedLeft + cell.width * metrics.cellWidth;
          const center = (allocatedLeft + allocatedRight) / 2;
          const inkLeft = center - leftExtent;
          const inkRight = center + rightExtent;
          const overhangLeft = Math.max(0, allocatedLeft - inkLeft);
          const overhangRight = Math.max(0, inkRight - allocatedRight);
          if (overhangLeft <= 0.5 && overhangRight <= 0.5) continue;
          glyphInkOverhang.push({
            text: cell.text,
            row,
            col,
            spanCells: cell.width,
            inkLeft: roundProbePixels(inkLeft),
            inkRight: roundProbePixels(inkRight),
            allocatedLeft: roundProbePixels(allocatedLeft),
            allocatedRight: roundProbePixels(allocatedRight),
            overhangLeft: roundProbePixels(overhangLeft),
            overhangRight: roundProbePixels(overhangRight),
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
    glyphInkOverhang,
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
    overlayViewport: requestedOverlayViewport,
    children,
    focusedId = null,
    theme,
    feedback,
    metrics: explicitMetrics,
    fontSize,
    fontProfile: requestedFontProfile,
    palette: paletteOverride,
    label = "Cell interface",
    className,
    probeId,
    fontAudit: auditFonts = false,
    onCommand,
    cellRange: controlledCellRange,
    onCellRangeCommand,
  } = props;
  const overlayViewport = requestedOverlayViewport ?? viewport;
  const fontProfile = useMemo(() => createCellUiFontProfile(requestedFontProfile), [requestedFontProfile]);
  const fontMetrics = useCellFontMetrics(fontProfile, fontSize, explicitMetrics);
  const fontAudit = useCellFontAudit(
    !!probeId && auditFonts && fontMetrics.ready,
    fontProfile,
    fontMetrics.metrics
  );
  const { metrics } = fontMetrics;
  const resolvedFeedback = useMemo(() => resolveCellFeedback(feedback), [feedback]);
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
  const [canvasRef] = useState(() => new CellPresentationRegistry());
  const cursorPresenterRef = useRef<CellCursorPresenter | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointerFocusRequestRef = useRef(false);
  const [activeFocusId, setActiveFocusId] = useState<WidgetId | null>(null);
  const focusFromPointer = (surface: HTMLDivElement) => {
    setActiveFocusId(null);
    pointerFocusRequestRef.current = true;
    try { surface.focus({ preventScroll: true }); }
    finally { pointerFocusRequestRef.current = false; }
  };
  const runtimeRef = useRef<CellUiRuntime | null>(null);
  const frameRef = useRef<FrameSnapshot | null>(null);
  const presentationMetricsRef = useRef(metrics);
  const [controller] = useState(() => new CellInteractionController(
    () => {
      setActivationFlashId(controller.feedback.activeId);
      setPressActiveId(controller.press.activeId);
      setManipulatingIds((current) => sameWidgetIdSet(current, controller.gestures.manipulatingIds) ? current : controller.gestures.manipulatingIds);
      setInteractionRevision((value) => value + 1);
    },
    (command) => onCommandRef.current(command),
  ));
  const focusRef = useRef(controller.focus);
  const eventsRef = useRef(new EventManager());
  const gesturesRef = useRef(controller.gestures);
  const pressRef = useRef(controller.press);
  const activationFeedbackRef = useRef(controller.feedback);
  const activationBlinkCountRef = useRef(resolvedFeedback.activationBlinkCount);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const inputModalityRef = useRef<"keyboard" | "pointer">("keyboard");
  const [inputModality, setInputModalityState] = useState<"keyboard" | "pointer">("keyboard");
  const setInputModality = useCallback((next: "keyboard" | "pointer") => {
    controller.setInputSource(next);
    inputModalityRef.current = next;
    setInputModalityState(next);
  }, [controller]);
  const surfaceFocus = useSurfaceFocus(surfaceRef);
  const focusVisible = surfaceFocus.active && inputModality === "keyboard";
  const runtimeActiveFocusId = surfaceFocus.active ? activeFocusId : null;
  const ownsFocus = surfaceFocus.ownsFocus;
  const focusedIdRef = useRef<WidgetId | null | undefined>(undefined);
  const lifetimeRef = useRef<object | null>(null);
  const projectionRef = useRef<Readonly<{
    children: ReactElement<RootProps>;
    focusedId: WidgetId | null;
    hoveredId: WidgetId | null;
    manipulatingIds: ReadonlySet<WidgetId>;
    pressActiveId: WidgetId | null;
    activationFlashId: WidgetId | null;
    theme: Partial<CellUiTheme> | undefined;
    feedback: Partial<CellFeedbackConfig> | undefined;
    interactionRevision: number;
    activeFocusId: WidgetId | null;
    focusVisible: boolean;
    width: number;
    height: number;
    overlayWidth: number;
    overlayHeight: number;
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
  const [manipulatingIds, setManipulatingIds] = useState<ReadonlySet<WidgetId>>(() => new Set());
  const [pressActiveId, setPressActiveId] = useState<WidgetId | null>(null);
  const [activationFlashId, setActivationFlashId] = useState<WidgetId | null>(null);
  const [fontPresentationRevision, setFontPresentationRevision] = useState(0);
  const [frame, setFrame] = useState<FrameSnapshot | null>(null);
  const pointerAppearance = usePointerAppearance(canvasRef, frame, metrics);
  const hoveredId = activationFeedbackRef.current.settling
    ? null
    : pointerAppearance.hoveredId;
  useLayoutEffect(() => {
    const current = frameRef.current;
    if (current && inputModality === "pointer") controller.setHovered(current, hoveredId);
  }, [controller, hoveredId, inputModality]);
  const syncManipulatingIds = useCallback(() => {
    const next = gesturesRef.current.manipulatingIds;
    setManipulatingIds((current) => sameWidgetIdSet(current, next) ? current : next);
  }, []);

  const cancelActivationFeedback = useCallback(() => {
    if (controller.cancel()) {
      setActivationFlashId(null);
      setInteractionRevision((value) => value + 1);
    }
  }, [controller]);

  const flushActivationFeedbackCompletion = useCallback(() => controller.flush(), [controller]);

  useEffect(() => {
    if (activationBlinkCountRef.current === resolvedFeedback.activationBlinkCount) return;
    activationBlinkCountRef.current = resolvedFeedback.activationBlinkCount;
    controller.settle();
  }, [controller, resolvedFeedback.activationBlinkCount]);

  const confirmationThemeRef = useRef(resolvedTheme);
  const confirmationPaletteRef = useRef(palette);
  useLayoutEffect(() => {
    if (!sameWidgetValue(confirmationThemeRef.current, resolvedTheme)
      || !sameWidgetValue(confirmationPaletteRef.current, palette)) controller.settle();
    confirmationThemeRef.current = resolvedTheme;
    confirmationPaletteRef.current = palette;
  }, [controller, resolvedTheme, palette]);

  useEffect(() => {
    const deactivate = () => controller.deactivate();
    const visibility = () => { if (document.hidden) deactivate(); };
    window.addEventListener("blur", deactivate);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", deactivate);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller]);

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
    controller.cancel();
  }, [controller]);

  useLayoutEffect(() => {
    const previousProjection = projectionRef.current;
    if (
      previousProjection?.children === children
      && previousProjection.focusedId === focusedId
      && previousProjection.hoveredId === hoveredId
      && previousProjection.manipulatingIds === manipulatingIds
      && previousProjection.pressActiveId === pressActiveId
      && previousProjection.activationFlashId === activationFlashId
      && previousProjection.theme === theme
      && previousProjection.feedback === feedback
      && previousProjection.interactionRevision === interactionRevision
      && previousProjection.activeFocusId === runtimeActiveFocusId
      && previousProjection.focusVisible === focusVisible
      && previousProjection.width === viewport.width
      && previousProjection.height === viewport.height
      && previousProjection.overlayWidth === overlayViewport.width
      && previousProjection.overlayHeight === overlayViewport.height
    ) return;

    let runtime = runtimeRef.current;
    if (!runtime) {
      runtime = new CellUiRuntime({ viewport, overlayViewport, theme, feedback });
      runtimeRef.current = runtime;
    } else {
      runtime.resize(viewport, overlayViewport);
      runtime.setTheme(theme);
      runtime.setFeedback(feedback);
    }
    const focusedChanged = focusedIdRef.current !== focusedId;
    const next = runtime.render(children, {
      hoveredId,
      manipulatingIds,
      pressActiveId,
      activationFlashId,
      activationTargetId: controller.snapshot.activationTargetId,
      confirmation: controller.feedback.presentation,
      colors: { color: palette.color, backgroundColor: palette.background },
      activeFocusId: runtimeActiveFocusId,
      focusVisible,
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
      pressRef.current.cancelPointer(pointerId);
    }
    for (const pointerId of gesturesRef.current.sync((candidate) => validGestureCandidate(next, candidate))) {
      eventsRef.current.cancel(pointerId);
      pressRef.current.cancelPointer(pointerId);
      const surface = surfaceRef.current;
      if (surface?.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
    }
    syncManipulatingIds();
    if (pressRef.current.sync(next)) setPressActiveId(pressRef.current.activeId);
    if (controller.sync(next)) {
      setActivationFlashId(null);
      flushActivationFeedbackCompletion();
    }
    focusedIdRef.current = focusedId;
    for (const command of textViewportCommands(next)) onCommand(command);
    if (focusedChanged && focusedId) {
      const reveal = revealCommandForTarget(next, focusedId);
      if (reveal) onCommand(reveal);
    }
    frameRef.current = next;
    projectionRef.current = {
      children,
      focusedId,
      hoveredId,
      manipulatingIds,
      pressActiveId,
      activationFlashId,
      theme,
      feedback,
      interactionRevision,
      activeFocusId: runtimeActiveFocusId,
      focusVisible,
      width: viewport.width,
      height: viewport.height,
      overlayWidth: overlayViewport.width,
      overlayHeight: overlayViewport.height,
    };
    // The headless runtime is an external store; publish its committed snapshot.
    setFrame(next);
  }, [controller, palette.color, palette.background, activationFlashId, children, flushActivationFeedbackCompletion, focusedId, focusVisible, hoveredId, interactionRevision, manipulatingIds, onCommand, overlayViewport, pressActiveId, runtimeActiveFocusId, syncManipulatingIds, theme, feedback, viewport]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || frameRef.current !== frame) return;
    if (!sameWidgetValue(presentationMetricsRef.current, metrics)) {
      const pointerIds = new Set(gesturesRef.current.sync(() => false));
      if (rangeDragRef.current) pointerIds.add(rangeDragRef.current.pointerId);
      if (textDragRef.current) pointerIds.add(textDragRef.current.pointerId);
      rangeDragRef.current = null;
      textDragRef.current = null;
      for (const id of pointerIds) {
        eventsRef.current.cancel(id);
        pressRef.current.cancelPointer(id);
        if (surfaceRef.current?.hasPointerCapture(id)) surfaceRef.current.releasePointerCapture(id);
      }
      setPressActiveId(pressRef.current.activeId);
      syncManipulatingIds();
    }
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
      fontProfile
    );
    let allPlanesPresented = true;
    for (const plane of frame.overlayPlanes) {
      const overlayCanvas = canvasRef.overlay(plane.rootId);
      if (!overlayCanvas) { allPlanesPresented = false; continue; }
      presentFrame(
        overlayCanvas,
        frame,
        metrics,
        palette,
        cellRange,
        rangeDragRef.current ? "selecting" : "resting",
        resolvedTheme,
        fontProfile,
        {
          buffer: frame.overlayBuffer,
          viewport: plane.bounds,
          transparent: true,
        }
      );
    }
    presentationMetricsRef.current = metrics;
    if (allPlanesPresented) controller.presented(frame.confirmation);
  }, [controller, canvasRef, cellRange, fontProfile, frame, metrics, palette, resolvedTheme, syncManipulatingIds]);

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
          fontProfile
        );
        for (const plane of current.overlayPlanes) {
          const overlayCanvas = canvasRef.overlay(plane.rootId);
          if (!overlayCanvas) continue;
          presentFrame(
            overlayCanvas,
            current,
            metrics,
            palette,
            cellRange,
            rangeDragRef.current ? "selecting" : "resting",
            resolvedTheme,
            fontProfile,
            {
              buffer: current.overlayBuffer,
              viewport: plane.bounds,
              transparent: true,
            }
          );
        }
        setFontPresentationRevision((revision) => revision + 1);
      }
    };
  }, [canvasRef, metrics, palette, cellRange, resolvedTheme, fontProfile]);
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
      },
    };
    surface[CELL_SURFACE_PROBE_PROPERTY] = snapshot;
    return () => {
      if (surface[CELL_SURFACE_PROBE_PROPERTY] === snapshot) {
        delete surface[CELL_SURFACE_PROBE_PROPERTY];
      }
    };
  }, [canvasRef, auditFonts, fontPresentationRevision, fontProfile, frame, metrics, probeId, fontMetrics, fontAudit]);

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
        fontProfile
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, cellRange, fontProfile, frame, metrics, palette, resolvedTheme]);

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
    const current = frameRef.current;
    if (current) controller.commit(command, current, resolvedFeedback.activationBlinkCount);
  }, [controller, resolvedFeedback.activationBlinkCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      const current = frameRef.current;
      if (!current || event.ctrlKey) return;
      if (activationFeedbackRef.current.settling) {
        event.preventDefault();
        return;
      }
      const result = resolveWheelInput(current, {
        type: "wheel",
        point: pxToCellPoint(event, canvas.getBoundingClientRect(), metrics),
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      if (result.consumed) event.preventDefault();
      dispatch(result.command);
    };
    const canvases = canvasRef.canvases();
    canvases.forEach((target) => target.addEventListener("wheel", wheel, { passive: false }));
    return () => canvases.forEach((target) => target.removeEventListener("wheel", wheel));
  }, [canvasRef, dispatch, frame, metrics]);

  const textDragPointFor = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    return bounds ? pxToCellPoint(event, bounds, metrics) : null;
  };

  const isSurfaceCanvas = (target: EventTarget | null) =>
    canvasRef.owns(target);

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
    syncManipulatingIds();
    if (pressRef.current.cancelPointer(pointerId)) setPressActiveId(pressRef.current.activeId);
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
    setInputModality("keyboard");
    const input = keyInputFromKeyboardEvent(event.nativeEvent);
    if (activationFeedbackRef.current.settling) {
      if (isCellKeyPress(input, "Tab")) return;
      if (isCellKeyPress(input, "Escape") && frame) {
        controller.key(frame, input, resolvedFeedback.activationBlinkCount);
      }
      event.preventDefault();
      return;
    }
    if (isCellKeyPress(input, "Escape") && cellRange && rangeEditable) {
      event.preventDefault();
      dispatchCellRange({ type: "clear" });
      return;
    }
    if (
      !frame
      || (event.target instanceof HTMLTextAreaElement && event.key !== "Escape")
    ) return;
    if (controller.key(frame, input, resolvedFeedback.activationBlinkCount)) event.preventDefault();
  };

  const onSurfaceBlur = (event: FocusEvent<HTMLDivElement>) => {
    surfaceFocus.leave(event);
    const surface = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && surface.contains(relatedTarget)) return;
    const cancelTransientFeedback = () => {
      const pointerIds = gesturesRef.current.sync(() => false);
      for (const pointerId of pointerIds) {
        eventsRef.current.cancel(pointerId);
        if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
      }
      rangeDragRef.current = null;
      textDragRef.current = null;
      syncManipulatingIds();
      if (pressRef.current.cancel()) setPressActiveId(null);
      cancelActivationFeedback();
    };
    const confirmExit = () => {
      setActiveFocusId(null);
      cancelTransientFeedback();
      const current = frameRef.current;
      if (current) dispatch(dismissCommandForFocusExit(current));
      if (cellRange && rangeEditable) dispatchCellRange({ type: "clear" });
    };
    if (relatedTarget) {
      confirmExit();
      return;
    }
    if (!surface.ownerDocument.hasFocus()) {
      cancelTransientFeedback();
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
      data-cell-active-focus={frame
        ? [...frame.tree.nodes.values()].find((node) => node.focusActive)?.id
        : undefined}
      data-cell-hovered={hoveredId ?? undefined}
      data-cell-manipulating={manipulatingIds.size > 0 || undefined}
      data-cell-press-active={pressActiveId ?? undefined}
      data-cell-activation-flash={activationFlashId ?? undefined}
      data-cell-confirmation-session={frame?.confirmation?.sessionId}
      data-cell-confirmation-phase={frame?.confirmation?.phase}
      data-cell-overlay-count={frame?.overlayPlanes.length || undefined}
      data-cell-focus-visible={frame?.semantics.focusedId
        && frame.tree.nodes.get(frame.semantics.focusedId)?.focusVisible
        ? true
        : undefined}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        pointerAppearance.suspend();
        if (event.button !== 0) return;
        setInputModality("pointer");
        if (!frame) return;
        const point = textDragPointFor(event);
        if (!point) return;
        if (controller.interceptPointer(frame, point)) {
          const command = commandForInput(
            { type: "pointer", phase: "down", point, button: event.button },
            frame,
            focusRef.current
          );
          if (command?.type === "dismiss") dispatch(command);
          event.preventDefault();
          focusFromPointer(event.currentTarget);
          return;
        }
        cancelActivationFeedback();
        if (isCellRangePointerChord(event) && rangeEditable) {
          event.preventDefault();
          rangeDragRef.current = { anchor: point, pointerId: event.pointerId };
          textDragRef.current = null;
          event.currentTarget.setPointerCapture(event.pointerId);
          setCellRange(point, point);
          focusFromPointer(event.currentTarget);
          return;
        }
        if (cellRange && rangeEditable) dispatchCellRange({ type: "clear" });
        if (!isSurfaceCanvas(event.target)) return;
        const immediate = commandForInput(
          { type: "pointer", phase: "down", point, button: event.button },
          frame,
          focusRef.current
        );
        if (immediate?.type === "dismiss" || immediate?.type === "set-expanded") {
          dispatch(immediate);
          const target = frame.tree.nodes.get(immediate.targetId);
          if (target?.kind === "combobox-input") focusTextarea(target.id);
          else focusFromPointer(event.currentTarget);
          return;
        }
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
          controller.beginPointer(frame, event.pointerId, point, candidates, precisePoint);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (editor && !editor.disabled && onScrollbar) {
          dispatch({ type: "focus", targetId: editor.id });
          focusTextarea(editor.id);
        } else {
          focusFromPointer(event.currentTarget);
        }
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse" && event.buttons === 0) setInputModality("pointer");
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
        const signals = controller.movePointer(frame, event.pointerId, point, pxToCellPosition(event, bounds, metrics));
        applyGestureSignals(frame, signals);
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
            const signals = controller.endPointer(frame, event.pointerId, point, pxToCellPosition(event, bounds, metrics));
            applyGestureSignals(frame, signals);
          }
        } finally {
          finishPointer(event);
          pointerAppearance.resume(event);
        }
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && event.buttons === 0) setInputModality("pointer");
        pointerAppearance.move(event);
        const point = textDragPointFor(event);
        if (frame && point && pressRef.current.movePointer(frame, event.pointerId, point)) {
          setPressActiveId(pressRef.current.activeId);
        }
      }}
      onPointerLeave={(event) => {
        pointerAppearance.clear();
        const point = textDragPointFor(event);
        if (frame && point && pressRef.current.movePointer(frame, event.pointerId, point)) {
          setPressActiveId(pressRef.current.activeId);
        }
      }}
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
        const target = event.target;
        setActiveFocusId(target instanceof HTMLElement
          ? target.dataset.cellTextEditor ?? target.dataset.cellSemanticId ?? null
          : null);
        if (event.target === event.currentTarget && !pointerFocusRequestRef.current) setInputModality("keyboard");
        surfaceFocus.enter();
        if (event.target === event.currentTarget) syncDomFocus();
        if (!frame || focusRef.current.focusedId) return;
        const targetId = focusRef.current.first(frame.tree);
        if (targetId) dispatch({ type: "focus", targetId });
      }}
      onBlur={onSurfaceBlur}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        const input = keyInputFromKeyboardEvent(event.nativeEvent);
        if (event.defaultPrevented || !frame || (event.target instanceof HTMLTextAreaElement && event.key !== "Escape")) return;
        if (controller.key(frame, input, resolvedFeedback.activationBlinkCount)) event.preventDefault();
      }}
      style={{ position: "relative", width: "fit-content", outline: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: pointerAppearance.cursor }}
        aria-hidden="true"
        data-cell-text={frame ? formatCellBuffer(frame.buffer, { trimEnd: true }) : undefined}
      />
      {frame?.overlayPlanes.map((plane) => (
        <canvas
          key={plane.rootId}
          ref={(canvas) => {
            canvasRef.setOverlay(plane.rootId, canvas);
          }}
          aria-hidden="true"
          data-cell-overlay-root={plane.rootId}
          data-cell-text={formatCellBuffer(frame.overlayBuffer, {
            region: plane.bounds,
            trimEnd: true,
          })}
          style={{
            display: "block",
            position: "absolute",
            inset: 0,
            zIndex: plane.layer,
            cursor: pointerAppearance.cursor,
            clipPath: `inset(${plane.bounds.y * metrics.cellHeight}px ${Math.max(
              0,
              (frame.scene.overlayViewport.width - plane.bounds.x - plane.bounds.width)
                * metrics.cellWidth
            )}px ${Math.max(
              0,
              (frame.scene.overlayViewport.height - plane.bounds.y - plane.bounds.height)
                * metrics.cellHeight
            )}px ${plane.bounds.x * metrics.cellWidth}px)`,
          }}
        />
      ))}
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
            setInputModality("keyboard");
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
