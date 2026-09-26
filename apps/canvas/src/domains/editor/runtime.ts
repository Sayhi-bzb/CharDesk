import {
  type CanvasState,
  type ToolType,
} from "@/domains/canvas/public";
import { EditorRuntime } from "./core/runtime";
import type { EditorExtension } from "./core/extension";
import type {
  EditorHistoryPort,
  EditorStateAdapter,
  EditorTransactionPort,
} from "./core/types";
import {
  CanvasInteractionPortBinding,
  CanvasToolStateNode,
  type CanvasEditorInputEvent,
  type CanvasInteractionState,
} from "./canvasToolRuntime";

const BUILT_IN_TOOLS: readonly ToolType[] = [
  "select",
  "pan",
  "text",
  "brush",
  "eraser",
  "fill",
  "box",
  "splitBox",
  "line",
  "arrowLine",
  "bg",
  "stepline",
  "circle",
];

export const createCanvasEditorExtension = (
  interactionPort: CanvasInteractionPortBinding
): EditorExtension<
  CanvasState,
  CanvasEditorInputEvent
> => ({
  id: "chardesk.canvas",
  stateScopes: [
    { key: "canvas.content", scope: "document" },
    { key: "canvas.interaction", scope: "session" },
    { key: "canvas.viewport", scope: "session" },
    { key: "canvas.preferences", scope: "session" },
    { key: "canvas.projection", scope: "derived" },
  ],
  tools: BUILT_IN_TOOLS.map((id) => ({
    id,
    create: (editor, parent) =>
      new CanvasToolStateNode(editor, id, parent, interactionPort),
  })),
});

export class CanvasEditorRuntime extends EditorRuntime<
  CanvasState,
  CanvasEditorInputEvent
> {
  readonly interactionPort = new CanvasInteractionPortBinding();

  getInteractionState = (): CanvasInteractionState => {
    const current = this.root.getCurrent();
    return current instanceof CanvasToolStateNode
      ? current.getInteractionState()
      : { type: "idle" };
  };

  finalizePendingSelection = () => {
    const state = this.getInteractionState();
    if (state.type !== "selecting") return false;
    return this.dispatch({
      type: "canvas-drag-end",
      button: 0,
      endGrid: state.current,
    });
  };

  cancelActiveInteraction = () => {
    if (this.getInteractionState().type === "idle") return false;
    return this.dispatch({
      type: "canvas-interaction-cancel",
      reason: "history",
    });
  };

  activateInteractionOwner = (ownerId: string) => {
    if (this.interactionPort.isActive(ownerId)) return false;
    if (this.getInteractionState().type !== "idle") {
      this.dispatch({
        type: "canvas-interaction-cancel",
        reason: "identity",
      });
    }
    return this.interactionPort.activate(ownerId);
  };
}

export type CanvasEditorRuntimePorts = {
  state: EditorStateAdapter<CanvasState>;
  history: EditorHistoryPort;
  transactions: EditorTransactionPort;
  onToolChange?: (id: ToolType) => void;
};

export const createCanvasEditorRuntime = (ports: CanvasEditorRuntimePorts) => {
  let runtime: CanvasEditorRuntime | null = null;
  const history: EditorHistoryPort = {
    canUndo: () =>
      runtime?.getInteractionState().type !== "idle" ||
      (ports.history.canUndo?.() ?? ports.state.get().canUndo),
    canRedo: () =>
      runtime?.getInteractionState().type !== "idle" ||
      (ports.history.canRedo?.() ?? ports.state.get().canRedo),
    undo: () => runtime?.cancelActiveInteraction() || ports.history.undo(),
    redo: () => runtime?.cancelActiveInteraction() || ports.history.redo(),
    beginCheckpoint: ports.history.beginCheckpoint,
    finishCapture: ports.history.finishCapture,
  };
  const editor = new CanvasEditorRuntime({
    state: ports.state,
    history,
    transactions: ports.transactions,
    onToolChange: (id) => ports.onToolChange?.(id as ToolType),
  });
  runtime = editor;
  return editor;
};
