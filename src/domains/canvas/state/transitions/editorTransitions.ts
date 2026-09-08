import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { SlideDeckDescriptor } from "@/domains/slides/public";
import { createStaticGridState } from "@/domains/selection/public";
import type { EditorState } from "../interfaces";
import type { resolveSessionDescriptorRuntime } from "../helpers/storeUtils";
import {
  getStructuredTextCaretPoint,
  getStructuredTextOffsetAtPoint,
  normalizeStructuredTextSelection,
  type StructuredNode,
} from "@/domains/structured-content/public";
import { splitGraphemes } from "@/shared/metrics";
import {
  createCanvasContentSurface,
  createStructuredContentSurface,
} from "../helpers/gridHelpers";
import type { CanvasSurfaceReader } from "../../cell-plane/model";

type SessionRuntime = ReturnType<typeof resolveSessionDescriptorRuntime> & {
  nextSlideDeck: SlideDeckDescriptor | null;
  nextScene: StructuredNode[];
  nextComponents: EditorState["structuredComponents"];
};

type DocumentInteractionResetPatch = Pick<
  EditorState,
  | "textCursor"
  | "editingStructuredTextNodeId"
  | "structuredTextSelection"
  | "selectedStructuredNodeIds"
  | "selectedStructuredBoxId"
  | "selectedStructuredSplitHandle"
  | "structuredContextPoint"
  | "structuredGridFocus"
  | "staticGridSelection"
  | "staticGridEditMode"
  | "staticGridInputFlow"
  | "hoveredGrid"
  | "scratchLayer"
  | "canvasColorPickerTarget"
>;

type SessionActivationPatch = Pick<
  EditorState,
  | "canvasSessions"
  | "activeCanvasId"
  | "canvasMode"
  | "slideDeck"
  | "structuredScene"
  | "structuredComponents"
  | "contentSurface"
  | "tool"
> &
  DocumentInteractionResetPatch;

type SlideActivationPatch = Pick<
  EditorState,
  "slideDeck" | "contentSurface"
> &
  DocumentInteractionResetPatch;

export const createDocumentInteractionResetPatch =
  (): DocumentInteractionResetPatch => {
    const staticGrid = createStaticGridState();
    return {
      textCursor: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredGridFocus: null,
      staticGridSelection: staticGrid.selection,
      staticGridEditMode: staticGrid.editMode,
      staticGridInputFlow: null,
      hoveredGrid: null,
      scratchLayer: null,
      canvasColorPickerTarget: null,
    };
  };

export const createStructuredGridFocusPatch = (
  point: EditorState["structuredGridFocus"]
): Partial<EditorState> => ({
  structuredGridFocus: point ? { ...point } : null,
  ...(point
    ? {
        selectedStructuredNodeIds: [],
        selectedStructuredBoxId: null,
        selectedStructuredSplitHandle: null,
        structuredContextPoint: null,
        editingStructuredTextNodeId: null,
        structuredTextSelection: null,
        textCursor: null,
        staticGridEditMode: "navigate" as const,
        staticGridInputFlow: null,
      }
    : {}),
});

export const reconcileStructuredInteraction = (
  state: EditorState,
  structuredScene: StructuredNode[]
) => {
  const byId = new Map(structuredScene.map((node) => [node.id, node]));
  const selectedStructuredNodeIds = state.selectedStructuredNodeIds.filter((id) => byId.has(id));
  const selectedBox = state.selectedStructuredBoxId
    ? byId.get(state.selectedStructuredBoxId)
    : null;
  const selectedSplit = state.selectedStructuredSplitHandle
    ? byId.get(state.selectedStructuredSplitHandle.nodeId)
    : null;
  const editingNode = state.editingStructuredTextNodeId
    ? byId.get(state.editingStructuredTextNodeId)
    : null;
  const selectedTextNode = state.structuredTextSelection
    ? byId.get(state.structuredTextSelection.nodeId)
    : null;
  const structuredTextSelection =
    state.structuredTextSelection && selectedTextNode?.type === "text"
      ? normalizeStructuredTextSelection(
          state.structuredTextSelection,
          splitGraphemes(selectedTextNode.text).length
        )
      : null;

  let textCursor = state.textCursor;
  if (state.editingStructuredTextNodeId && editingNode?.type !== "text") {
    textCursor = null;
  } else if (editingNode?.type === "text" && state.textCursor) {
    const previousNode = state.structuredScene.find(
      (node) => node.id === editingNode.id && node.type === "text"
    );
    if (previousNode?.type === "text") {
      const offset = Math.min(
        getStructuredTextOffsetAtPoint(previousNode, state.textCursor),
        splitGraphemes(editingNode.text).length
      );
      textCursor = getStructuredTextCaretPoint(editingNode, offset);
    }
  }

  return {
    selectedStructuredNodeIds,
    selectedStructuredBoxId: selectedBox?.type === "box" ? selectedBox.id : null,
    selectedStructuredSplitHandle:
      selectedSplit?.type === "splitBox" ? state.selectedStructuredSplitHandle : null,
    structuredContextPoint:
      selectedStructuredNodeIds.length === 1 ? state.structuredContextPoint : null,
    editingStructuredTextNodeId: editingNode?.type === "text" ? editingNode.id : null,
    structuredTextSelection,
    textCursor,
  };
};

export const createSessionActivationPatch = (
  canvasSessions: CanvasSessionDescriptor[],
  activeCanvasId: string,
  runtime: SessionRuntime,
  contentReader: CanvasSurfaceReader
): SessionActivationPatch => ({
  canvasSessions,
  activeCanvasId,
  canvasMode: runtime.nextMode,
  slideDeck: runtime.nextSlideDeck,
  structuredScene: runtime.nextScene,
  structuredComponents: runtime.nextComponents,
  contentSurface: runtime.nextMode === "structured"
    ? createStructuredContentSurface(runtime.nextScene)
    : createCanvasContentSurface(contentReader),
  tool: runtime.nextTool,
  ...createDocumentInteractionResetPatch(),
});

export const createSlideActivationPatch = (
  slideDeck: SlideDeckDescriptor,
  activeReader: CanvasSurfaceReader
): SlideActivationPatch => ({
  slideDeck,
  contentSurface: createCanvasContentSurface(activeReader),
  ...createDocumentInteractionResetPatch(),
});
