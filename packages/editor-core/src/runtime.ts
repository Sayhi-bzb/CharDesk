import { createShapePoints, planDrawingPatch, planForegroundFill } from './drawing/planner.js';
import {
  DEFAULT_DRAWING_SETTINGS,
  readDrawingSettings,
  type DrawingSettings,
} from './drawing/settings.js';
import { validateDrawingWork } from './drawing/limits.js';
import { resolveDrawingShapeDragStartDecision } from './interaction/dragStart.js';
import { resolveDragUpdateDecision } from './interaction/dragUpdate.js';
import type { ToolType } from './interaction/tool.js';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import type { GridPoint } from '@chardesk/cell-plane/types';
import { filterRichPasteCells } from './clipboard/richCells.js';
import { SynchronousCommitBoundary } from './commitBoundary.js';
import {
  selectGridRangeAt,
  moveGridFocus,
  selectWrittenBounds,
  selectGridAxis,
  moveGridFocusToEdge,
  moveGridFocusToContentBoundary,
  type GridEdge,
  type GridCornerOrEdge,
} from './selection/commands.js';
import { fillGridSelection } from './selection/fill.js';
import {
  planSelectionStyle,
  readSelectionStyle,
  readSelectionStyleChange,
  type SelectionStyleChange,
} from './selection/style.js';
import { resolveGridSelectionCoverage, validateSelectionWork } from './selection/coverage.js';
import { resolveGridSelectionPresentation } from './selection/presentation.js';
import {
  getGridSelectionRanges,
  getStaticGridSelectionAreas,
  collapseGridSelectionTo,
} from './selection/static-grid.js';
import { deleteRect } from '@chardesk/cell-plane/grid-ops';
import {
  createClipboardCommands,
  type ClipboardPort,
  type ClipboardCommandResult,
  type ClipboardTextPreparation,
  type PreparedClipboardPaste,
  ClipboardRequestScope,
} from './clipboard/commands.js';
import type { EditorExtension } from './editor/extension.js';
import type { CanvasDocumentAddress, CanvasDocumentDraft } from './canvasDocumentModel.js';
import type { EditorCommandResult } from './editor/types.js';
import type { RichTextRow, RichTextCell } from './textCommandTypes.js';
import { parseCharDeskText } from '@chardesk/protocol';
import { createProjectedSource } from './interaction/preview.js';
import { EditorRuntime } from './editor/runtime.js';
import {
  CanvasInteractionPortBinding,
  CanvasToolStateNode,
  type CanvasEditorInputEvent,
  type CanvasInteractionState,
} from './interaction/canvasToolRuntime.js';
import { createCanvasInteractionPort, InteractionStateCapture } from './interaction/controller.js';
import { resolveSelectionDragStartDecision } from './interaction/dragStart.js';
import type { StaticGridRangeMovePlan } from './rangeMove.js';
import { createStaticGridRangeMovePlan, planRangeMoveAnchors } from './rangeMove.js';
import type { CanvasAnchorSeed } from './canvasAnchorModel.js';
import { readEditorView, type EditorView } from './viewState.js';
import {
  createStaticGridState,
  extendGridSelectionTo,
  getGridSelectionExtent,
  getStaticGridSelection,
  getStaticGridViewState,
  type StaticGridState,
} from './selection/static-grid.js';
import {
  createStaticGridInputSession,
  advanceStaticGridTextInput,
} from './selection/static-grid-input-session.js';
import { prepareCanvasRowsWrite } from './writeText.js';
import {
  resolveStaticGridDeletePlan,
  resolveStaticGridDeletionState,
} from './selection/static-grid-deletion.js';
import { CanvasDocumentRegistry } from './CanvasDocumentRegistry.js';
import { type CellFrame, type CellPoint, type CellRange, type CellRect } from '@chardesk/cell-core';
import {
  getGraphemeCellWidth,
  iterateGraphemes,
  parseCharDeskTextRows,
  segmentGraphemes,
} from '@chardesk/protocol';
import {
  CellPlaneIndex,
  resolveGridSlot,
  type CellPlanePatch,
  type GridCell,
} from '@chardesk/cell-plane';

const FOREGROUND = '#000000';

export type FreeformEditorSessionOptions = {
  /** Injected registries remain owned by the caller. */
  documents?: CanvasDocumentRegistry;
  document?: CanvasDocumentDraft;
  address?: CanvasDocumentAddress;
  prepareText?: ClipboardTextPreparation;
  autoAnchors?: boolean | (() => boolean);
  extensions?: readonly EditorExtension<
    ReturnType<FreeformEditorSession['getSnapshot']>,
    CanvasEditorInputEvent
  >[];
};
type LocalDocumentState = {
  interaction: StaticGridState;
  viewport: { x: number; y: number };
  tool: string;
  drawing: DrawingSettings;
  inputColumn: number;
  lastTyped: CellPoint | null;
  diagnostics: NonNullable<PreparedClipboardPaste['diagnostics']>;
};

/** Headless single-page editor over the shared document, command and interaction primitives. */
export class FreeformEditorSession {
  readonly editor: EditorRuntime<
    ReturnType<FreeformEditorSession['getSnapshot']>,
    CanvasEditorInputEvent
  >;
  readonly #binding = new CanvasInteractionPortBinding();
  readonly #capture = new InteractionStateCapture();
  #savedInteraction: StaticGridState | null = null;
  #savedTyping: { inputColumn: number; lastTyped: CellPoint | null } | null = null;
  #rangePreview: StaticGridRangeMovePlan | null = null;
  #drawing: DrawingSettings = { ...DEFAULT_DRAWING_SETTINGS };
  #drawingError: string | null = null;
  #styleCache?: { key: string; value: ReturnType<typeof readSelectionStyle> };
  #strokePoints: GridPoint[] = [];
  #erasePoints: CellPoint[] = [];
  #drawingPatch: CellPlanePatch | null = null;
  #drawingProjection: ReturnType<typeof createProjectedSource> | null = null;
  get drawingSettings(): Readonly<DrawingSettings> {
    return { ...this.#drawing };
  }
  setDrawingSettings(settings: Partial<DrawingSettings>) {
    const next = readDrawingSettings({ ...this.#drawing, ...settings });
    this.#run(() => {
      this.cancelInteraction();
      this.#drawing = next;
      this.#bindInteraction();
    });
  }
  #clearDrawing() {
    this.#strokePoints = [];
    this.#erasePoints = [];
    this.#drawingPatch = null;
    this.#drawingProjection = null;
  }
  #previewDrawing(
    points: readonly GridPoint[],
    erasures: readonly CellPoint[] = [],
    replace = false
  ) {
    validateDrawingWork(
      (replace ? 0 : this.#strokePoints.length + this.#erasePoints.length) +
        points.length +
        erasures.length
    );
    if (replace) {
      this.#strokePoints = [...points];
      this.#erasePoints = [...erasures];
    } else {
      this.#strokePoints = this.#strokePoints.concat(points);
      this.#erasePoints = this.#erasePoints.concat(erasures);
    }
    const patch = planDrawingPatch(this.plane, this.#strokePoints, this.#erasePoints);
    const overlay = new Map<string, GridCell>();
    for (const row of patch.rows)
      for (const span of row.spans) {
        const { x, text, ...style } = span;
        overlay.set(`${x},${row.y}`, { char: text, ...style });
      }
    this.#drawingPatch = patch;
    this.#drawingProjection = createProjectedSource(this.plane, {
      hiddenSpans: patch.rows.flatMap((row) =>
        row.erase.map((erase) => ({ y: row.y, minX: erase.from, maxX: erase.to }))
      ),
      overlay: createGridMapSource(overlay),
    });
  }
  readonly #boundary = new SynchronousCommitBoundary();
  #disposed = false;
  #clipboardGeneration = 0;
  readonly #clipboardRequests = new ClipboardRequestScope();
  readonly #ownsDocuments: boolean;
  readonly #detachDocuments: Array<() => void> = [];
  #address = '';
  #reader!: CellPlaneIndex;
  #targetGeneration = 0;
  readonly #externalVersions = new Map<string, number>();
  readonly #localDocuments = new Map<string, LocalDocumentState>();
  #pasteDiagnostics: NonNullable<PreparedClipboardPaste['diagnostics']> = [];
  get currentTool() {
    return this.editor.getCurrentToolId() ?? 'select';
  }
  get gestureState(): CanvasInteractionState {
    const tool = this.editor.root.getCurrent();
    return tool instanceof CanvasToolStateNode ? tool.getInteractionState() : { type: 'idle' };
  }
  get rangePreview() {
    return this.#rangePreview;
  }
  setTool(tool: string) {
    return this.#run(() => {
      if (!this.editor.setCurrentTool(tool)) return false;
      this.#drawingError = null;
      this.#bindInteraction();
      return true;
    });
  }
  cancelInteraction() {
    if (this.gestureState.type === 'idle') return;
    this.#run(() => this.editor.dispatch({ type: 'canvas-interaction-cancel', reason: 'escape' }));
  }
  /** Editing consumes a passive selection preview; staged moves/drawing still cancel. */
  settleInteraction() {
    const state = this.gestureState;
    if (state.type === 'selecting' && this.currentTool === 'select') {
      this.#run(() =>
        this.editor.dispatch({
          type: 'canvas-drag-end',
          button: 0,
          endGrid: state.current,
        })
      );
    } else this.cancelInteraction();
  }
  pointer(input: {
    phase: 'down' | 'move' | 'up';
    cell: CellPoint;
    screen: CellPoint;
    delta?: CellPoint;
    shift?: boolean;
    append?: boolean;
    button?: number;
  }) {
    if ((input.button ?? 0) !== 0) return false;
    return this.#run(() => {
      if (input.phase === 'down') {
        if (this.currentTool !== 'pan') this.cancelPendingPaste();
        return this.editor.dispatch({
          type: 'canvas-drag-start',
          canvasMode: 'freeform',
          button: input.button ?? 0,
          isCtrlOrMetaPressed: input.append ?? false,
          shiftKey: input.shift ?? false,
          detail: 1,
          gridPoint: input.cell,
          screenPoint: input.screen,
          brushChar: this.#drawing.char,
        });
      }
      if (input.phase === 'move')
        return this.editor.dispatch({
          type: 'canvas-drag-update',
          currentGrid: input.cell,
          delta: input.delta ?? { x: 0, y: 0 },
        });
      return this.editor.dispatch({
        type: 'canvas-drag-end',
        button: input.button ?? 0,
        endGrid: input.cell,
      });
    });
  }
  #bindInteraction() {
    const tool = this.currentTool as ToolType;
    const capture = this.#capture;
    const setSelection = (start: CellPoint, end: CellPoint) => {
      this.selection = { anchor: start, focus: end };
    };
    this.#binding.bind(
      createCanvasInteractionPort({
        tool,
        canvasMode: 'freeform',
        brushChar: this.#drawing.char,
        onDrawingError: (error) => {
          this.#drawingError = error.message;
          this.#emit();
        },
        capture,
        rangeMoveThreshold: 1,
        pointerContext: { hasCanvasRect: () => true },
        beginInteraction: () => {
          this.#savedInteraction = structuredClone(this.#interaction);
          this.#savedTyping = { inputColumn: this.#inputColumn, lastTyped: this.#lastTyped };
          this.#drawingError = null;
          this.#clearDrawing();
        },
        completeInteraction: () => {
          if (tool !== 'select' && tool !== 'pan' && this.#savedInteraction) {
            this.#interaction = this.#savedInteraction;
            if (this.#savedTyping) {
              this.#inputColumn = this.#savedTyping.inputColumn;
              this.#lastTyped = this.#savedTyping.lastTyped;
            }
          }
          this.#savedTyping = null;
          this.#clearDrawing();
          this.#savedInteraction = null;
          this.#rangePreview = null;
        },
        cancelInteraction: () => {
          this.#clearDrawing();
          if (this.#savedInteraction) this.#interaction = this.#savedInteraction;
          if (this.#savedTyping) {
            this.#inputColumn = this.#savedTyping.inputColumn;
            this.#lastTyped = this.#savedTyping.lastTyped;
          }
          this.#savedTyping = null;
          this.#savedInteraction = null;
          this.#rangePreview = null;
          this.#emit();
        },
        getSelectionAnchor: () => getStaticGridSelection(this.#interaction).anchorCell,
        dragStart: (event) => {
          if (tool === 'pan') {
            capture.setState({ type: 'panning', lastScreen: event.screenPoint });
            return true;
          }
          const point = event.resolveGridPoint(event.screenPoint);
          if (!point) return false;
          const decision = resolveSelectionDragStartDecision({
            tool,
            canvasMode: 'freeform',
            start: point,
            shiftKey: event.shiftKey,
            anchorGrid: event.anchorGrid,
          });
          if (decision.type !== 'selection') {
            const drawing = resolveDrawingShapeDragStartDecision({
              tool,
              canvasMode: 'freeform',
              start: point,
              brushChar: this.#drawing.char,
            });
            if (drawing.type === 'ignore') return false;
            capture.setState(drawing.state);
            if (drawing.type === 'drawing') {
              if (drawing.scratchPoint)
                this.#previewDrawing([
                  { ...drawing.scratchPoint, color: this.#drawing.foreground },
                ]);
              if (drawing.erasePoint) this.#previewDrawing([], [drawing.erasePoint]);
            }
            return true;
          }
          capture.setState({ type: 'selecting', anchor: decision.dragStart, current: point });
          if (event.shiftKey) setSelection(decision.dragStart, point);
          else this.pointAt(point);
          return true;
        },
        dragUpdate: ({ state, currentGrid }) => {
          if (state.type === 'shapePreview') {
            const decision = resolveDragUpdateDecision({
              state,
              canvasMode: 'freeform',
              currentGrid,
            });
            if (decision.type === 'shape-preview') {
              capture.setState({ ...state, current: currentGrid, axis: decision.update.axis });
              this.#previewDrawing(
                createShapePoints(tool, state.start, currentGrid, this.#drawing, {
                  axis: decision.update.axis,
                }),
                [],
                true
              );
            }
          }
          if (state.type === 'selecting') {
            capture.setState({ ...state, current: currentGrid });
            if (!state.append) setSelection(state.anchor, currentGrid);
          }
        },
        dragEnd: ({ state }) => {
          if (state.type === 'drawing' || state.type === 'shapePreview') {
            if (this.#drawingPatch) this.apply(this.#drawingPatch);
            return true;
          }
          return false;
        },
        commitSelection: (decision) => {
          if (decision.type === 'fill')
            this.apply(
              planForegroundFill(this.plane, decision.selection, this.#drawing.foreground)
            );
          else if (decision.type === 'setStaticGridActiveCell') this.pointAt(decision.point);
          else if (decision.type === 'setStaticGridSelectionRange')
            setSelection(decision.selection.start, decision.selection.end);
          else if (decision.type === 'appendStaticGridSelectionRange')
            this.#interaction = {
              mode: 'navigate',
              selection: selectGridRangeAt(
                this.plane,
                getStaticGridSelection(this.#interaction),
                decision.selection,
                true
              ),
            };
        },
        canStartStaticRangeMove: (point) => {
          return (
            getStaticGridSelection(this.#interaction).additionalRanges.length === 0 &&
            this.containsSelection(point)
          );
        },
        updateStaticRangeMove: (anchor, current) => {
          if (this.selection)
            this.#rangePreview = createStaticGridRangeMovePlan({
              source: this.plane,
              range: { start: this.selection.anchor, end: this.selection.focus },
              requestedDelta: { x: current.x - anchor.x, y: current.y - anchor.y },
            });
        },
        commitStaticRangeMove: (anchor, current) => {
          this.moveSelection(current.x - anchor.x, current.y - anchor.y);
        },
        clearStaticRangeMovePreview: () => {
          this.#rangePreview = null;
        },
        beginAppendSelection: () => {},
        queuePan: (delta) => this.pan(-delta.x, -delta.y),
        flushPan: () => {},
        clearLinkHover: () => {},
        setCursor: () => {},
        addScratchPoints: (points) =>
          this.#previewDrawing(
            points.map((point) => ({ ...point, color: this.#drawing.foreground }))
          ),
        erasePoints: (points) => this.#previewDrawing([], points),
        setHoveredGrid: () => {},
      })
    );
  }
  #emit() {
    this.#boundary.deferUntilCommitted(this.#notify);
  }
  readonly #notify = () => this.#listeners.forEach((listener) => listener());

  readonly #listeners = new Set<() => void>();
  getSnapshot = () =>
    Object.freeze({
      interaction: this.#interaction,
      viewport: { ...this.viewport },
      reader: this.plane,
      version: this.version,
      dirty: this.dirty,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      address: this.documents.getActiveAddress(),
      pasteDiagnostics: this.#pasteDiagnostics,
      drawingSettings: this.drawingSettings,
      drawingError: this.#drawingError,
    });
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #run<Result>(command: () => Result): Result {
    return this.#boundary.run(() => {
      const interaction = this.#interaction;
      try {
        return command();
      } finally {
        if (interaction !== this.#interaction) this.#targetGeneration++;
        this.#emit();
      }
    });
  }
  #clipboard!: ReturnType<typeof createClipboardCommands>;
  #clipboardPort: ClipboardPort | null = null;
  #execute<Data = unknown>(id: string, input?: unknown): EditorCommandResult<Data> {
    return this.editor.commands.execute<unknown, Data>(id, input, 'host');
  }
  readonly commands = {
    selectRow: () => this.#execute('selection.row'),
    selectColumn: () => this.#execute('selection.column'),
    navigateToEdge: (edge: GridCornerOrEdge, selecting = false) =>
      this.#execute('selection.edge', { edge, selecting }),
    navigateToContentBoundary: (edge: GridEdge, selecting = false) =>
      this.#execute('selection.boundary', { edge, selecting }),
    style: (change: SelectionStyleChange) => this.#execute('selection.style', change),
    anchors: {
      add: (name?: string) => this.#execute('anchors.add', name),
      rename: (id: string, label: string) => this.#execute('anchors.rename', { id, label }),
      remove: (id: string) => this.#execute('anchors.remove', id),
      reattach: (id: string) => this.#execute('anchors.reattach', id),
      jump: (id: string) => this.#execute('anchors.jump', id),
    },
    insert: (text: string) => this.#execute('text.insert', text),
    insertRows: (rows: readonly RichTextRow[], at: CellPoint) =>
      this.#execute('content.insertRows', { rows, at }),
    erase: () => this.#execute('selection.delete'),
    deleteBackward: () => this.#execute('text.backspace'),
    moveSelection: (x: number, y: number) => this.#execute('selection.move', { x, y }),
    navigate: (x: number, y: number, selecting = false) =>
      this.#execute('selection.navigate', { x, y, selecting }),
    beginInsert: () => this.#execute('text.begin'),
    escape: () => this.#execute('interaction.cancel'),
    undo: () => this.#execute('history.undo'),
    redo: () => this.#execute('history.redo'),
    selectAll: () => this.#execute('selection.all'),
    pointAt: (point: CellPoint) => this.#execute('selection.point', point),
    focusContent: () => this.#execute('viewport.focus'),
    pasteProvided: (text: string) =>
      this.#execute<ClipboardCommandResult>('clipboard.pasteProvided', text),
    copy: (options?: { rich?: boolean; ansi?: boolean }) =>
      this.#execute<ClipboardCommandResult>('clipboard.copy', options),
    cut: () => this.#execute<ClipboardCommandResult>('clipboard.cut'),
    paste: () => this.#execute<ClipboardCommandResult>('clipboard.paste'),
  };
  configureClipboard(port: ClipboardPort) {
    const generation = ++this.#clipboardGeneration;
    this.#clipboardRequests.begin();
    this.#clipboardPort = port;
    return () => {
      if (generation !== this.#clipboardGeneration) return;
      this.#clipboardGeneration++;
      this.#clipboardRequests.begin();
      this.#clipboardPort = null;
    };
  }
  #configurePaste(
    prepareText?: ClipboardTextPreparation,
    autoAnchors: boolean | (() => boolean) = false
  ) {
    this.#clipboard = createClipboardCommands({
      isActive: () => !this.#disposed,
      requests: this.#clipboardRequests,
      prepareText,
      autoAnchors: () => (typeof autoAnchors === 'function' ? autoAnchors() : autoAnchors),
      onPasteDiagnostics: (diagnostics) => {
        this.#pasteDiagnostics = diagnostics;
      },
      getState: () => ({
        target: JSON.stringify({
          address: this.documents.getActiveAddress(),
          staticGrid: this.#interaction,
          generation: this.#targetGeneration,
          revision: this.plane.getRevision(),
        }),
        reader: this.plane,
        selections: getGridSelectionRanges(getStaticGridSelection(this.#interaction)),
        cursor: this.inserting ? this.cursor : null,
        foreground: FOREGROUND,
        selectResult: true,
      }),
      port: {
        read: (state) =>
          this.#clipboardPort?.read(state) ?? Promise.resolve({ error: 'clipboard-failed' }),
        write: (payload, options) =>
          this.#clipboardPort?.write(payload, options) ??
          Promise.resolve({ status: 'unavailable' }),
      },
      mutations: {
        transact: (fn) => this.#run(fn),
        deleteSelection: () => this.erase(),
        erasePoints: (points) => {
          this.apply({
            rows: points.map((p) => ({ y: p.y, erase: [{ from: p.x, to: p.x }], spans: [] })),
          });
        },
        pasteRichRows: (rows, at, options) =>
          this.#pasteRows(rows, at, options?.selectResult, options?.anchorSeeds),
        pasteRichData: (cells, at, options) => this.#pasteCells(cells, at, options?.selectResult),
        pastePlainText: (text, color, selectResult) => {
          const cells = this.#plainCells(text, color);
          if (!cells.length) return false;
          this.#pasteCells(cells, undefined, selectResult);
          return true;
        },
      },
    });
  }
  #plainCells(text: string, color = FOREGROUND): RichTextCell[] {
    return parseCharDeskText(text, { syntax: 'plain', defaultStyle: { color } }).cells.map(
      (cell) => ({ x: cell.x, y: cell.y, char: cell.text, color: cell.color ?? color })
    );
  }
  #pasteCells(cells: readonly RichTextCell[], at?: CellPoint, selectResult = true) {
    const rows = new Map<number, RichTextRow>();
    for (const cell of filterRichPasteCells(cells)) {
      let row = rows.get(cell.y);
      if (!row) {
        row = { y: cell.y, spans: [] };
        rows.set(cell.y, row);
      }
      row.spans.push({ ...cell, text: cell.char, width: getGraphemeCellWidth(cell.char) });
    }
    this.#pasteRows([...rows.values()], at, selectResult);
  }
  #pasteRows(
    rows: readonly RichTextRow[],
    at?: CellPoint,
    selectResult = true,
    anchorSeeds: readonly CanvasAnchorSeed[] = []
  ) {
    this.cancelInteraction();
    const origin =
      at ?? (this.inserting ? this.cursor : (this.selectionAreas[0]?.start ?? this.cursor));
    const plan = prepareCanvasRowsWrite(origin, rows, 'replace');
    if (!plan.bounds) return;
    this.apply(
      plan.patch,
      undefined,
      anchorSeeds.map((seed) => ({
        ...seed,
        point: { x: seed.point.x + origin.x, y: seed.point.y + origin.y },
      }))
    );
    this.#interaction = createStaticGridState(origin);
    this.#lastTyped = null;
    if (selectResult) {
      const [x, y, width, height] = plan.bounds;
      this.#interaction = {
        mode: 'navigate',
        selection: selectWrittenBounds(getStaticGridSelection(this.#interaction), {
          minX: x,
          minY: y,
          maxX: x + width - 1,
          maxY: y + height - 1,
        }),
      };
    }
    this.revealCursor();
  }
  #registerCommands() {
    const selection = () => getStaticGridSelection(this.#interaction);
    const navigate = (next: ReturnType<typeof selection>, extend = false) => {
      this.#interaction = { mode: 'navigate', selection: next };
      this.#lastTyped = null;
      this.revealCursor(extend ? getGridSelectionExtent(next) : next.activeCell);
    };
    const edgeInput = (input: unknown) => {
      if (
        !input ||
        typeof input !== 'object' ||
        !('edge' in input) ||
        !['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right'].includes(String(input.edge))
      )
        throw new TypeError('Expected a grid boundary direction.');
      return {
        edge: input.edge as GridCornerOrEdge,
        selecting: 'selecting' in input && input.selecting === true,
      };
    };
    const point = (input: unknown): input is { x: number; y: number; selecting?: boolean } =>
      !!input &&
      typeof input === 'object' &&
      'x' in input &&
      typeof input.x === 'number' &&
      'y' in input &&
      typeof input.y === 'number';
    const sync: Record<string, (input: unknown) => void> = {
      'selection.row': () => navigate(selectGridAxis(this.plane, selection(), 'row')),
      'selection.column': () => navigate(selectGridAxis(this.plane, selection(), 'column')),
      'selection.edge': (input) => {
        const { edge, selecting } = edgeInput(input);
        navigate(moveGridFocusToEdge(this.plane, selection(), edge, selecting), selecting);
      },
      'selection.boundary': (input) => {
        const { edge, selecting } = edgeInput(input);
        if (edge === 'top-left' || edge === 'bottom-right')
          throw new TypeError('Expected a content boundary direction.');
        navigate(
          moveGridFocusToContentBoundary(this.plane, selection(), edge, selecting),
          selecting
        );
      },
      'anchors.add': (input) => {
        if (input === undefined || typeof input === 'string')
          this.documents.addAnchorAt(this.documents.getActiveAddress(), this.cursor, input);
      },
      'anchors.remove': (input) => {
        if (typeof input === 'string')
          this.documents.removeAnchorAt(this.documents.getActiveAddress(), input);
      },
      'anchors.reattach': (input) => {
        if (typeof input === 'string')
          this.documents.reattachAnchorAt(this.documents.getActiveAddress(), input, this.cursor);
      },
      'anchors.rename': (input) => {
        if (
          input &&
          typeof input === 'object' &&
          'id' in input &&
          'label' in input &&
          typeof input.id === 'string' &&
          typeof input.label === 'string'
        )
          this.documents.renameAnchorAt(this.documents.getActiveAddress(), input.id, input.label);
      },
      'anchors.jump': (input) => {
        const anchor = this.anchors.find((item) => item.id === input);
        if (anchor) this.focusPoint(anchor.point);
      },
      'content.insertRows': (input) => {
        if (
          !input ||
          typeof input !== 'object' ||
          !('rows' in input) ||
          !Array.isArray(input.rows) ||
          !('at' in input) ||
          !point(input.at)
        )
          throw new Error('Expected prepared rows and a Cell position.');
        this.#pasteRows(input.rows, input.at);
      },
      'text.insert': (input) => {
        if (typeof input === 'string') this.insert(input);
      },
      'selection.point': (input) => {
        if (point(input)) {
          this.cancelInteraction();
          this.pointAt(input);
          this.revealCursor();
        }
      },
      'viewport.focus': () => {
        this.cancelInteraction();
        this.focusContent();
      },
      'selection.delete': () => this.erase(),
      'selection.style': (input) => {
        const change = readSelectionStyleChange(input);
        this.apply(
          planSelectionStyle(this.plane, this.selectionRanges, change, this.#drawing.foreground)
        );
      },
      'text.backspace': () => this.deleteBackward(),
      'selection.move': (input) => {
        if (point(input)) this.moveSelection(input.x, input.y);
      },
      'selection.navigate': (input) => {
        if (point(input)) this.navigate(input.x, input.y, input.selecting);
      },
      'text.begin': () => this.beginInsert(),
      'interaction.cancel': () => {
        this.cancelPendingPaste();
        this.cancelInteraction();
        this.escape();
      },
      'history.undo': () => {
        this.cancelInteraction();
        this.undo();
      },
      'history.redo': () => {
        this.cancelInteraction();
        this.redo();
      },
      'selection.all': () => {
        this.cancelInteraction();
        const b = this.plane.getContentBounds();
        if (b) {
          this.#interaction = createStaticGridState({ x: b.x, y: b.y });
          this.selection = {
            anchor: { x: b.x, y: b.y },
            focus: { x: b.x + b.width - 1, y: b.y + b.height - 1 },
          };
        }
      },
    };
    this.editor.registerExtension({
      id: 'freeform-commands',
      commands: [
        ...Object.entries(sync).map(([id, run]) => ({
          id,
          execute: (input: unknown) => {
            this.editor.transact(() => {
              if (id === 'interaction.cancel' || id === 'text.begin' || id.startsWith('history.'))
                this.cancelInteraction();
              else this.settleInteraction();
              run(input);
            });
            return { handled: true as const, status: 'succeeded' as const };
          },
        })),
        ...(['copy', 'cut', 'paste', 'pasteProvided'] as const).map((kind) => ({
          id: `clipboard.${kind}`,
          execute: (input: unknown) => {
            if (kind === 'pasteProvided' && typeof input !== 'string')
              return {
                handled: true as const,
                status: 'rejected' as const,
                reason: 'invalid-input',
              };
            if (kind !== 'pasteProvided' && !this.#clipboardPort)
              return {
                handled: true as const,
                status: 'rejected' as const,
                reason: 'clipboard-unavailable',
              };
            this.settleInteraction();
            let request: Promise<ClipboardCommandResult>;
            if (kind === 'pasteProvided')
              request = this.#clipboard.pasteProvided({ plainText: input as string });
            else if (kind === 'copy') {
              const options =
                input && typeof input === 'object'
                  ? {
                      rich: 'rich' in input && input.rich === true,
                      ansi: 'ansi' in input && input.ansi === true,
                    }
                  : undefined;
              request = this.#clipboard.copy(options);
            } else request = this.#clipboard[kind]();
            const completion = request.then((data) =>
              data.status === 'failed'
                ? { succeeded: false as const, changed: false as const, reason: data.reason }
                : {
                    succeeded: true as const,
                    changed: data.status === 'applied' && data.changed,
                    data,
                  }
            );
            return { handled: true as const, status: 'pending' as const, completion };
          },
        })),
      ],
    });
  }
  readonly documents: CanvasDocumentRegistry;
  get plane() {
    const reader = this.documents.getContentReader();
    if (!(reader instanceof CellPlaneIndex)) throw new Error('Expected a CellPlane document');
    return reader;
  }
  #interaction: StaticGridState = createStaticGridState();
  get cursor(): CellPoint {
    return this.#interaction.mode === 'text-edit'
      ? this.#interaction.session.activeCell
      : this.#interaction.selection.activeCell;
  }
  set cursor(point: CellPoint) {
    if (this.#interaction.mode === 'text-edit')
      this.#interaction = {
        mode: 'text-edit',
        session: { ...this.#interaction.session, activeCell: point, nextCell: point },
      };
    else
      this.#interaction = {
        mode: 'navigate',
        selection: { ...this.#interaction.selection, activeCell: point },
      };
  }
  get selection(): CellRange | null {
    const state = getStaticGridSelection(this.#interaction);
    return state.mode === 'range'
      ? { anchor: state.anchorCell, focus: getGridSelectionExtent(state) }
      : null;
  }
  set selection(range: CellRange | null) {
    if (range) {
      this.#interaction = {
        mode: 'navigate',
        selection: selectGridRangeAt(this.plane, getStaticGridSelection(this.#interaction), {
          start: range.anchor,
          end: range.focus,
        }),
      };
    } else if (this.#interaction.mode === 'navigate')
      this.#interaction = createStaticGridState(this.cursor);
  }
  get inserting() {
    return this.#interaction.mode === 'text-edit';
  }

  viewport = { x: -3, y: -2, width: 80, height: 20 };
  readonly #savedVersions = new Map<string, string>();
  #inputColumn = 0;
  #lastTyped: CellPoint | null = null;

  constructor(source = '', options: FreeformEditorSessionOptions = {}) {
    if (source && (options.documents || options.document))
      throw new Error('Seed source and an existing document registry cannot be combined.');
    this.#ownsDocuments = !options.documents;
    this.documents = options.documents ?? new CanvasDocumentRegistry('terminal-main');
    if (options.document) {
      if (options.document.mode !== 'freeform') throw new Error('Expected a Freeform document.');
      this.documents.activateDocument(
        options.document.id,
        { ...options.document, grid: [] },
        { replace: true }
      );
    }
    if (
      options.address &&
      !this.documents.activatePage(options.address.documentId, options.address.pageId)
    ) {
      if (this.#ownsDocuments) this.documents.dispose();
      throw new Error('The initial document address does not exist.');
    }
    this.#address = JSON.stringify(this.documents.getActiveAddress());
    this.#reader = this.plane;
    this.editor = new EditorRuntime({
      state: {
        get: this.getSnapshot,
        subscribe: (listener) => {
          let previous = this.getSnapshot();
          return this.subscribe(() => {
            const next = this.getSnapshot();
            const before = previous;
            previous = next;
            listener(next, before);
          });
        },
      },
      history: {
        undo: () => this.documents.undo(),
        redo: () => this.documents.redo(),
        beginCheckpoint: () => this.documents.beginHistoryCheckpoint(),
        finishCapture: () => this.documents.finishHistoryCapture(),
      },
      transactions: { run: (fn) => this.#run(fn) },
    });
    try {
      this.editor.registerExtension({
        id: 'freeform',
        tools: (
          [
            'select',
            'pan',
            'brush',
            'eraser',
            'fill',
            'box',
            'splitBox',
            'line',
            'stepline',
            'circle',
            'bg',
          ] as const
        ).map((id) => ({
          id,
          create: (editor, parent) => new CanvasToolStateNode(editor, id, parent, this.#binding),
        })),
      });
      this.#registerCommands();
      this.#configurePaste(options.prepareText, options.autoAnchors);
      if (source) {
        const parsed = parseCharDeskTextRows(source, {
          syntax: 'ansi',
          defaultStyle: { color: FOREGROUND },
        });
        if (parsed.diagnostics.length) throw new Error(parsed.diagnostics[0]!.message);
        this.apply({
          rows: parsed.rows.map((row) => ({
            y: row.y,
            erase: [],
            spans: row.spans.map((span) => ({
              ...span,
              color: span.color ?? FOREGROUND,
            })),
          })),
        });
      }
      if (this.#ownsDocuments) this.documents.clearHistory();
      this.markSaved();
      this.#detachDocuments.push(
        this.documents.observeActiveTransactions((change, transaction) => {
          if (
            !this.#boundary.isRunning &&
            (change.contentChanged || change.pagesChanged || change.anchorsChanged)
          ) {
            if (!transaction.local)
              this.#externalVersions.set(
                this.#address,
                (this.#externalVersions.get(this.#address) ?? 0) + 1
              );
            this.cancelInteraction();
          }
          this.#emit();
        }),
        this.documents.subscribeHistoryAvailability(() =>
          this.#run(() => {
            const address = JSON.stringify(this.documents.getActiveAddress());
            const reader = this.plane;
            if (address !== this.#address || reader !== this.#reader) {
              this.cancelInteraction();
              this.cancelPendingPaste();
              if (address !== this.#address) {
                this.documents.finishHistoryCaptureAt(
                  JSON.parse(this.#address) as CanvasDocumentAddress
                );
                this.#localDocuments.set(this.#address, {
                  interaction: structuredClone(this.#interaction),
                  viewport: { x: this.viewport.x, y: this.viewport.y },
                  tool: this.currentTool,
                  drawing: { ...this.#drawing },
                  inputColumn: this.#inputColumn,
                  lastTyped: this.#lastTyped,
                  diagnostics: this.#pasteDiagnostics,
                });
              }
              const saved =
                address !== this.#address ? this.#localDocuments.get(address) : undefined;
              if (address === this.#address)
                this.#externalVersions.set(address, (this.#externalVersions.get(address) ?? 0) + 1);
              this.#drawingError = null;
              this.#address = address;
              this.#reader = reader;
              this.#interaction = saved
                ? structuredClone(saved.interaction)
                : createStaticGridState();
              this.viewport = { ...this.viewport, ...(saved?.viewport ?? { x: -3, y: -2 }) };
              this.#drawing = { ...(saved?.drawing ?? DEFAULT_DRAWING_SETTINGS) };
              this.#inputColumn = saved?.inputColumn ?? 0;
              this.#lastTyped = saved?.lastTyped ?? null;
              this.#pasteDiagnostics = saved?.diagnostics ?? [];
              if (saved) this.editor.setCurrentTool(saved.tool);
              this.#bindInteraction();
              this.#targetGeneration++;
            }
            this.#emit();
          })
        )
      );
      for (const extension of options.extensions ?? []) this.editor.registerExtension(extension);
      this.editor.start('select');
      this.#bindInteraction();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get version() {
    return this.versionAt(this.documents.getActiveAddress());
  }
  versionAt(address: CanvasDocumentAddress) {
    return JSON.stringify(
      this.documents.getPageDescriptors(address.documentId).map((page) => {
        const at = { documentId: address.documentId, pageId: page.id };
        return [
          page,
          this.documents.getHistoryVersionAt(at),
          this.#externalVersions.get(JSON.stringify(at)) ?? 0,
        ];
      })
    );
  }
  get dirty() {
    return this.isDirtyAt(this.documents.getActiveAddress());
  }
  get canUndo() {
    return this.documents.getHistoryAvailability().canUndo;
  }
  get canRedo() {
    return this.documents.getHistoryAvailability().canRedo;
  }
  markSaved() {
    for (const page of this.documents.getPageDescriptors())
      this.documents.finishHistoryCaptureAt({
        documentId: this.documents.getActiveDocumentId(),
        pageId: page.id,
      });
    this.#savedVersions.set(this.documents.getActiveDocumentId(), this.version);
  }
  markSavedAt(address: CanvasDocumentAddress, version: string) {
    if (this.versionAt(address) !== version) return false;
    for (const page of this.documents.getPageDescriptors(address.documentId))
      this.documents.finishHistoryCaptureAt({ documentId: address.documentId, pageId: page.id });
    this.#savedVersions.set(address.documentId, version);
    this.#emit();
    return true;
  }
  markDirtyAt(address: CanvasDocumentAddress) {
    this.#savedVersions.delete(address.documentId);
    this.#emit();
  }
  switchDocument(documentId: string, pageId?: string) {
    const address = this.documents.getDocumentAddress(documentId, pageId);
    return address
      ? this.#run(() => this.documents.activatePage(address.documentId, address.pageId))
      : false;
  }
  isDirtyAt(address: CanvasDocumentAddress) {
    return this.versionAt(address) !== this.#savedVersions.get(address.documentId);
  }
  viewAt(address: CanvasDocumentAddress): EditorView {
    if (JSON.stringify(address) === this.#address)
      return structuredClone({
        interaction: this.#savedInteraction ?? this.#interaction,
        viewport: { x: this.viewport.x, y: this.viewport.y },
        tool: this.currentTool,
        drawing: this.#drawing,
        inputColumn: this.#savedTyping?.inputColumn ?? this.#inputColumn,
        lastTyped: this.#savedTyping ? this.#savedTyping.lastTyped : this.#lastTyped,
      });
    const saved = this.#localDocuments.get(JSON.stringify(address));
    return structuredClone(
      saved
        ? {
            interaction: saved.interaction,
            viewport: saved.viewport,
            tool: saved.tool,
            drawing: saved.drawing,
            inputColumn: saved.inputColumn,
            lastTyped: saved.lastTyped,
          }
        : {
            interaction: createStaticGridState(),
            viewport: { x: -3, y: -2 },
            tool: 'pan',
            drawing: { ...DEFAULT_DRAWING_SETTINGS },
            inputColumn: 0,
            lastTyped: null,
          }
    );
  }
  restoreViewAt(address: CanvasDocumentAddress, input: unknown) {
    const view = readEditorView(input);
    if (!this.editor.root.children.has(view.tool)) throw new Error('Saved tool is not available.');
    if (!this.documents.getDocumentAddress(address.documentId, address.pageId))
      throw new Error('Saved document is not open.');
    this.#localDocuments.set(JSON.stringify(address), {
      ...view,
      drawing: view.drawing ?? { ...DEFAULT_DRAWING_SETTINGS },
      diagnostics: [],
    });
    if (JSON.stringify(address) === this.#address)
      this.#run(() => {
        this.cancelInteraction();
        this.cancelPendingPaste();
        this.#interaction = view.interaction;
        this.#drawing = view.drawing ?? { ...DEFAULT_DRAWING_SETTINGS };
        this.viewport = { ...this.viewport, ...view.viewport };
        this.#inputColumn = view.inputColumn;
        this.#lastTyped = view.lastTyped;
        this.#pasteDiagnostics = [];
        this.editor.setCurrentTool(view.tool);
        this.#bindInteraction();
      });
  }
  forgetDocument(documentId: string) {
    if (documentId === this.documents.getActiveDocumentId()) return false;
    if (!this.documents.destroyDocument(documentId)) return false;
    this.#savedVersions.delete(documentId);
    for (const key of this.#localDocuments.keys()) {
      if ((JSON.parse(key) as CanvasDocumentAddress).documentId === documentId)
        this.#localDocuments.delete(key);
    }
    for (const key of this.#externalVersions.keys()) {
      if ((JSON.parse(key) as CanvasDocumentAddress).documentId === documentId)
        this.#externalVersions.delete(key);
    }
    this.#emit();
    return true;
  }
  apply(
    patch: CellPlanePatch,
    movedAnchors?: ReturnType<typeof planRangeMoveAnchors>,
    createdAnchors: readonly CanvasAnchorSeed[] = []
  ) {
    this.#run(() =>
      this.documents.applyCellPlanePatchAt(
        this.documents.getActiveAddress(),
        patch,
        'save',
        movedAnchors,
        createdAnchors
      )
    );
  }
  undo() {
    if (this.documents.undo()) {
      this.#lastTyped = null;
    }
  }
  redo() {
    if (this.documents.redo()) {
      this.#lastTyped = null;
    }
  }

  get selectionCoverage() {
    validateSelectionWork(this.selectionRanges);
    return resolveGridSelectionCoverage(
      this.selection ? getGridSelectionRanges(getStaticGridSelection(this.#interaction)) : [],
      this.plane
    );
  }

  get selectionRanges() {
    return this.selection ? getGridSelectionRanges(getStaticGridSelection(this.#interaction)) : [];
  }
  get selectionStyle() {
    const ranges = this.selectionRanges;
    const key = JSON.stringify([
      this.documents.getActiveAddress(),
      this.plane.getRevision(),
      ranges,
    ]);
    if (this.#styleCache?.key !== key)
      this.#styleCache = { key, value: readSelectionStyle(this.plane, ranges) };
    return this.#styleCache.value;
  }

  get selectionPresentation() {
    return this.selectionPresentationFor();
  }
  containsSelection(point: CellPoint) {
    return resolveGridSelectionCoverage(this.selectionRanges, this.plane, {
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
    }).contains(point);
  }
  selectionPresentationFor(clip?: CellRect) {
    if (!clip) validateSelectionWork(this.selectionRanges);
    const gesture = this.gestureState;
    return resolveGridSelectionPresentation({
      source: this.plane,
      clip,
      ranges: this.selection
        ? getGridSelectionRanges(getStaticGridSelection(this.#interaction))
        : [],
      draggingRange:
        gesture.type === 'selecting'
          ? { start: gesture.anchor, end: gesture.current, append: gesture.append }
          : null,
      movePreview: this.#rangePreview,
    });
  }

  get selectionAreas() {
    return this.selectionCoverage.areas;
  }

  get selectionBounds(): CellRect | null {
    const bounds = this.selectionCoverage.bounds;
    return (
      bounds && {
        x: bounds.start.x,
        y: bounds.start.y,
        width: bounds.end.x - bounds.start.x + 1,
        height: bounds.end.y - bounds.start.y + 1,
      }
    );
  }

  frame(): CellFrame<GridCell> {
    return {
      revision: this.plane.getRevision(),
      viewport: this.viewport,
      source:
        this.#drawingProjection ??
        (this.#rangePreview
          ? createProjectedSource(this.plane, {
              hiddenSpans: this.#rangePreview.hiddenSpans,
              overlay: this.#rangePreview.previewSource,
            })
          : this.plane),
      dirty: 'full',
    };
  }

  resize(width: number, height: number) {
    this.viewport = { ...this.viewport, width: Math.max(1, width), height: Math.max(1, height) };
  }

  pan(x: number, y: number) {
    this.viewport = { ...this.viewport, x: this.viewport.x + x, y: this.viewport.y + y };
  }
  get anchors() {
    return this.documents.getAnchorsAt(this.documents.getActiveAddress());
  }
  focusPoint(point: CellPoint) {
    this.viewport = {
      ...this.viewport,
      x: point.x - Math.floor(this.viewport.width / 2),
      y: point.y - Math.floor(this.viewport.height / 2),
    };
  }

  revealCursor(point = this.cursor) {
    const { x, y } = point;
    if (x < this.viewport.x) this.viewport.x = x;
    if (x + 1 >= this.viewport.x + this.viewport.width)
      this.viewport.x = Math.min(x, x - this.viewport.width + 2);
    if (y < this.viewport.y) this.viewport.y = y;
    if (y >= this.viewport.y + this.viewport.height) this.viewport.y = y - this.viewport.height + 1;
  }

  focusContent() {
    const bounds = this.plane.getContentBounds();
    this.pointAt(bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 });
    this.viewport.x = this.cursor.x - 3;
    this.viewport.y = this.cursor.y - 2;
  }

  pointAt(point: CellPoint, selecting = false) {
    const resolved = resolveGridSlot(this.plane, point)?.anchor ?? point;
    this.#interaction = {
      mode: 'navigate',
      selection: selecting
        ? extendGridSelectionTo(getStaticGridSelection(this.#interaction), resolved)
        : collapseGridSelectionTo(getStaticGridSelection(this.#interaction), resolved),
    };
    this.#lastTyped = null;
  }

  navigate(dx: number, dy: number, selecting = false) {
    const selection = moveGridFocus(
      this.plane,
      getStaticGridSelection(this.#interaction),
      { x: dx, y: dy },
      selecting
    );
    if (this.inserting && !selecting) {
      this.#interaction = {
        mode: 'text-edit',
        session: createStaticGridInputSession({ origin: selection.activeCell }),
      };
      this.#inputColumn = selection.activeCell.x;
    } else this.#interaction = { mode: 'navigate', selection };
    this.#lastTyped = null;
    this.revealCursor(selecting ? getGridSelectionExtent(selection) : selection.activeCell);
  }

  beginInsert() {
    if (this.currentTool !== 'select') this.setTool('select');
    this.#interaction = {
      mode: 'text-edit',
      session: createStaticGridInputSession({ origin: this.cursor }),
    };
    this.#inputColumn = this.cursor.x;
    this.selection = null;
    this.#lastTyped = null;
  }

  escape() {
    this.#interaction = createStaticGridState(this.cursor);
    this.selection = null;
    this.#lastTyped = null;
  }

  insert(text: string) {
    if (!text) return;
    this.settleInteraction();
    validateSelectionWork(this.selectionRanges);
    if (
      !this.inserting &&
      this.selection &&
      segmentGraphemes(text).length === 1 &&
      !/[\r\n\t]/.test(text)
    ) {
      const ranges = getGridSelectionRanges(getStaticGridSelection(this.#interaction));
      this.documents.mutateGridAt(
        this.documents.getActiveAddress(),
        (grid) => fillGridSelection(grid, this.plane, ranges, text, FOREGROUND),
        'save'
      );
      this.#lastTyped = null;
      return;
    }
    let origin = {
      ...(this.inserting ? this.cursor : (this.selectionAreas[0]?.start ?? this.cursor)),
    };
    const inputSession =
      this.#interaction.mode === 'text-edit'
        ? this.#interaction.session
        : createStaticGridInputSession({ origin });
    this.#inputColumn = inputSession.origin.x;
    // Terminal input can deliver a combining mark / ZWJ sequence in separate events.
    const previous = this.#lastTyped && this.plane.get(this.#lastTyped);
    if (
      previous &&
      this.#lastTyped!.y === origin.y &&
      this.#lastTyped!.x + getGraphemeCellWidth(previous.char) === origin.x
    ) {
      const joined = segmentGraphemes(previous.char + text)[0]!.segment;
      if (joined.length > previous.char.length) {
        origin = { ...this.#lastTyped! };
        text = previous.char + text;
      }
    }
    // A tab stop belongs to the input session, independent of event chunking.
    let column = origin.x - this.#inputColumn;
    let expanded = '';
    for (const { segment } of iterateGraphemes(text.replace(/\r\n?/g, '\n'))) {
      if (segment === '\t') {
        const spaces = 4 - (((column % 4) + 4) % 4);
        expanded += ' '.repeat(spaces);
        column += spaces;
      } else {
        expanded += segment;
        column = segment === '\n' ? 0 : column + getGraphemeCellWidth(segment);
      }
    }
    text = expanded;
    const parsed = parseCharDeskTextRows(text, {
      syntax: 'plain',
      defaultStyle: { color: FOREGROUND },
    });
    const rows = parsed.rows.map((row) => ({
      y: origin.y + row.y,
      erase: [],
      spans: row.spans.map((span) => ({
        ...span,
        x: (row.y === 0 ? origin.x : this.#inputColumn) + span.x,
        color: span.color ?? FOREGROUND,
      })),
    }));
    this.apply(prepareCanvasRowsWrite({ x: 0, y: 0 }, rows, 'replace').patch);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const last = lines.at(-1)!;
    const advanced = advanceStaticGridTextInput({
      session: {
        ...inputSession,
        nextCell: origin,
      },
      graphemes: segmentGraphemes(text).map(({ segment }) => segment),
    });
    this.#interaction = { mode: 'text-edit', session: advanced.session };
    const lastGrapheme = segmentGraphemes(last).at(-1)?.segment;
    this.#lastTyped =
      lastGrapheme && lastGrapheme !== '\t'
        ? { x: this.cursor.x - getGraphemeCellWidth(lastGrapheme), y: this.cursor.y }
        : null;
    this.selection = null;
    this.revealCursor();
  }

  erase(backwards = false) {
    this.settleInteraction();
    validateSelectionWork(this.selectionRanges);
    const direction = backwards ? 'backward' : 'forward';
    const plan = resolveStaticGridDeletePlan({
      interaction: getStaticGridViewState({ state: this.#interaction, grid: this.plane })
        .interaction,
      direction,
      grid: this.plane,
      previousInputCell:
        this.#interaction.mode === 'text-edit' ? this.#interaction.session.previousCell : null,
    });
    if (plan.kind === 'noop') return;
    const areas =
      plan.kind === 'range'
        ? getStaticGridSelectionAreas(getStaticGridSelection(this.#interaction), this.plane)
        : [{ start: plan.target, end: plan.target }];
    this.documents.mutateGridAt(
      this.documents.getActiveAddress(),
      (grid) => {
        for (const area of areas)
          deleteRect(grid, area.start.x, area.start.y, area.end.x, area.end.y);
      },
      'save'
    );
    this.#interaction = resolveStaticGridDeletionState(this.#interaction, plan, direction);
    this.#lastTyped = null;
    this.revealCursor();
  }

  deleteBackward() {
    this.erase(true);
  }

  moveSelection(dx: number, dy: number) {
    if (getStaticGridSelection(this.#interaction).additionalRanges.length) return false;
    const bounds = this.selectionBounds;
    if (!bounds) return false;
    const plan = createStaticGridRangeMovePlan({
      source: this.plane,
      range: { start: this.selection!.anchor, end: this.selection!.focus },
      requestedDelta: { x: dx, y: dy },
    });
    if (!plan) return false;
    this.apply(plan.patch, planRangeMoveAnchors(this.plane, plan, this.anchors));
    const selection = getStaticGridSelection(this.#interaction);
    this.#interaction = {
      mode: 'navigate',
      selection: {
        ...selection,
        activeCell: {
          x: selection.activeCell.x + plan.delta.x,
          y: selection.activeCell.y + plan.delta.y,
        },
        anchorCell: {
          x: selection.anchorCell.x + plan.delta.x,
          y: selection.anchorCell.y + plan.delta.y,
        },
        primaryRange: plan.targetRange,
      },
    };
    this.#lastTyped = null;
    this.revealCursor();
    return true;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.cancelPendingPaste();
    this.#detachDocuments.splice(0).forEach((detach) => detach());
    this.editor.dispose();
    this.#listeners.clear();
    if (this.#ownsDocuments) this.documents.dispose();
  }

  cancelPendingPaste() {
    this.#clipboardRequests.begin();
  }
}
