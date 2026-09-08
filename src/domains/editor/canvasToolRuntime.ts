import type { CanvasState, ToolType } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type {
  StructuredBoxResizeHandle,
  StructuredLineResizeHandle,
  StructuredNode,
  StructuredSplitBoxHandle,
} from "@/domains/structured-content/public";
import type { GridMap, Point } from "@/shared/types";
import type { EditorCommandHost, EditorInputEvent } from "./core/types";
import { EditorStateNode } from "./core/stateNode";

export type StructuredNodeDragPayload = {
  node: StructuredNode;
  selectedIds: string[];
  selectedNodes: StructuredNode[];
  baseScene: StructuredNode[];
  baseGrid: GridMap;
  handle:
    | StructuredBoxResizeHandle
    | StructuredSplitBoxHandle
    | StructuredLineResizeHandle
    | null;
};

type StructuredResizeStateBase = {
  anchor: Point;
  drag: StructuredNodeDragPayload;
};

export type CanvasInteractionState =
  | { type: "idle" }
  | { type: "panning"; lastScreen: Point }
  | { type: "selecting"; anchor: Point; current: Point; append?: boolean }
  | {
      type: "rangeMovePending";
      anchor: Point;
      current: Point;
      accumulated: Point;
    }
  | {
      type: "movingRange";
      anchor: Point;
      current: Point;
      accumulated: Point;
    }
  | {
      type: "drawing";
      tool: Extract<ToolType, "brush" | "eraser">;
      start: Point;
      lastGrid: Point;
      lastPlacedGrid: Point | null;
    }
  | {
      type: "shapePreview";
      tool: ToolType;
      start: Point;
      current: Point;
      axis: "horizontal" | "vertical" | null;
    }
  | ({ type: "structuredMoving" } & StructuredResizeStateBase)
  | ({ type: "structuredRectResizing" } & StructuredResizeStateBase)
  | ({ type: "structuredSplitBoxResizing" } & StructuredResizeStateBase)
  | ({ type: "structuredSplitBoxResizePending" } & StructuredResizeStateBase)
  | ({ type: "structuredLineResizing" } & StructuredResizeStateBase)
  | {
      type: "structuredTextSelecting";
      nodeId: string;
      anchorOffset: number;
      start: Point;
    };

export const getInteractionStart = (state: CanvasInteractionState): Point | null => {
  switch (state.type) {
    case "selecting": return state.anchor;
    case "rangeMovePending":
    case "movingRange": return state.anchor;
    case "drawing":
    case "shapePreview": return state.start;
    case "structuredMoving":
    case "structuredRectResizing":
    case "structuredSplitBoxResizing":
    case "structuredSplitBoxResizePending":
    case "structuredLineResizing": return state.anchor;
    case "structuredTextSelecting": return state.start;
    default: return null;
  }
};

export const isPrimaryDragState = (state: CanvasInteractionState): boolean =>
  state.type !== "idle" && state.type !== "panning";

export type CanvasToolInputEvent =
  | {
      type: "canvas-drag-start";
      canvasMode: CanvasMode;
      button: number;
      isCtrlOrMetaPressed: boolean;
      shiftKey: boolean;
      detail: number;
      screenPoint: Point;
      gridPoint: Point | null;
      brushChar: string;
    }
  | {
      type: "canvas-drag-update";
      delta: Point;
      currentGrid: Point | null;
    }
  | {
      type: "canvas-drag-end";
      button: number;
      endGrid: Point | null;
    }
  | {
      type: "canvas-interaction-cancel";
      reason:
        | "escape"
        | "blur"
        | "hidden"
        | "pointer"
        | "identity"
        | "history"
        | "dispose";
    };

export type CanvasEditorInputEvent = EditorInputEvent | CanvasToolInputEvent;

export interface CanvasInteractionPort {
  begin: () => void;
  start: (
    event: Extract<CanvasToolInputEvent, { type: "canvas-drag-start" }>,
    selectionAnchor: Point | null
  ) => { state: CanvasInteractionState; selectionAnchor?: Point | null } | null;
  update: (
    state: CanvasInteractionState,
    event: Extract<CanvasToolInputEvent, { type: "canvas-drag-update" }>
  ) => CanvasInteractionState;
  complete: (state: CanvasInteractionState, endGrid: Point | null) => void;
  cancel: (state: CanvasInteractionState) => void;
}

export class CanvasInteractionPortBinding {
  #port: CanvasInteractionPort | null = null;
  #portRef: { current: CanvasInteractionPort } | null = null;
  #ownerRefs = new Map<string, { current: CanvasInteractionPort }>();
  #activeOwnerId: string | null = null;

  bind(port: CanvasInteractionPort) {
    this.#port = port;
    this.#portRef = null;
    return () => {
      if (this.#port === port) this.#port = null;
    };
  }

  bindRef(portRef: { current: CanvasInteractionPort }) {
    this.#port = null;
    this.#portRef = portRef;
    return () => {
      if (this.#portRef === portRef) this.#portRef = null;
    };
  }

  registerRef(ownerId: string, portRef: { current: CanvasInteractionPort }) {
    this.#ownerRefs.set(ownerId, portRef);
    this.#activeOwnerId ??= ownerId;
    return () => {
      if (this.#ownerRefs.get(ownerId) !== portRef) return;
      this.#ownerRefs.delete(ownerId);
      if (this.#activeOwnerId === ownerId) this.#activeOwnerId = null;
    };
  }

  activate(ownerId: string) {
    if (!this.#ownerRefs.has(ownerId)) return false;
    const changed = this.#activeOwnerId !== ownerId;
    this.#activeOwnerId = ownerId;
    return changed;
  }

  isActive(ownerId: string) {
    return this.#activeOwnerId === ownerId;
  }

  get() {
    if (this.#activeOwnerId) {
      const activePort = this.#ownerRefs.get(this.#activeOwnerId)?.current;
      if (activePort) return activePort;
    }
    return this.#portRef?.current ?? this.#port;
  }
}

class CanvasToolInteractionStateNode extends EditorStateNode<
  CanvasState,
  CanvasEditorInputEvent
> {}

export class CanvasToolStateNode extends EditorStateNode<
  CanvasState,
  CanvasEditorInputEvent
> {
  #state: CanvasInteractionState = { type: "idle" };
  #selectionAnchor: Point | null = null;
  readonly #portBinding: CanvasInteractionPortBinding;

  constructor(
    editor: EditorCommandHost<CanvasState>,
    id: ToolType,
    parent: EditorStateNode<CanvasState, CanvasEditorInputEvent>,
    portBinding: CanvasInteractionPortBinding
  ) {
    super(editor, id, parent, "idle");
    this.#portBinding = portBinding;
    for (const stateId of [
      "idle",
      "panning",
      "selecting",
      "rangeMovePending",
      "movingRange",
      "drawing",
      "shapePreview",
      "structuredMoving",
      "structuredRectResizing",
      "structuredSplitBoxResizing",
      "structuredSplitBoxResizePending",
      "structuredLineResizing",
      "structuredTextSelecting",
    ] as const) {
      this.addChild(new CanvasToolInteractionStateNode(editor, stateId, this));
    }
  }

  getInteractionState(): CanvasInteractionState {
    return this.#state;
  }

  getSelectionAnchor() {
    return this.#selectionAnchor ? { ...this.#selectionAnchor } : null;
  }

  protected override onEvent(event: CanvasEditorInputEvent): boolean {
    if (event.type === "canvas-interaction-cancel") {
      return this.#cancel();
    }
    if (event.type === "canvas-drag-start") return this.#start(event);
    if (event.type === "canvas-drag-update") return this.#update(event);
    if (event.type === "canvas-drag-end") return this.#complete(event);
    return false;
  }

  protected override onExit() {
    this.#cancel(false);
  }

  #start(event: Extract<CanvasToolInputEvent, { type: "canvas-drag-start" }>) {
    if (this.#state.type !== "idle") this.#cancel();
    const port = this.#portBinding.get();
    if (!port) return false;

    port.begin();
    const start = port.start(event, this.getSelectionAnchor());
    if (!start) {
      port.cancel({ type: "idle" });
      return false;
    }
    if (start.selectionAnchor !== undefined) {
      this.#selectionAnchor = start.selectionAnchor
        ? { ...start.selectionAnchor }
        : null;
    }
    this.#setState(start.state);
    return true;
  }

  #update(event: Extract<CanvasToolInputEvent, { type: "canvas-drag-update" }>) {
    const port = this.#portBinding.get();
    if (!port || this.#state.type === "idle") return false;
    const next = port.update(this.#state, event);
    if (next.type !== this.#state.type) this.#setState(next);
    else this.#state = next;
    return true;
  }

  #complete(event: Extract<CanvasToolInputEvent, { type: "canvas-drag-end" }>) {
    const port = this.#portBinding.get();
    if (!port || this.#state.type === "idle") return false;
    const state = this.#state;
    port.complete(state, event.endGrid);
    this.#setState({ type: "idle" });
    return true;
  }

  #cancel(transitionToIdle = true) {
    if (this.#state.type === "idle") return false;
    this.#portBinding.get()?.cancel(this.#state);
    if (transitionToIdle) this.#setState({ type: "idle" });
    else this.#state = { type: "idle" };
    return true;
  }

  #setState(state: CanvasInteractionState) {
    this.#state = state;
    this.transition(state.type);
  }
}
