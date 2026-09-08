import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { SlideDeckDescriptor } from "@/domains/slides/public";
import type { EditorState } from "../interfaces";
import type { CanvasDocumentAddress } from "../canvasDocumentModel";
import {
  createCanvasInteractionPatch,
  createEmptyCanvasInteraction,
} from "../canvasInteractionState";
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

type DocumentInteractionResetPatch = Pick<EditorState, "interaction">;

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

export const createDocumentInteractionResetPatch = (
  address: CanvasDocumentAddress
): DocumentInteractionResetPatch => ({
  interaction: createEmptyCanvasInteraction(address),
});

export const reconcileStructuredInteraction = (
  state: EditorState,
  structuredScene: StructuredNode[]
) => {
  const interaction = state.interaction;
  const byId = new Map(structuredScene.map((node) => [node.id, node]));
  const selectedStructuredNodeIds = interaction.selectedStructuredNodeIds.filter((id) => byId.has(id));
  const selectedBox = interaction.selectedStructuredBoxId
    ? byId.get(interaction.selectedStructuredBoxId)
    : null;
  const selectedSplit = interaction.selectedStructuredSplitHandle
    ? byId.get(interaction.selectedStructuredSplitHandle.nodeId)
    : null;
  const editingNode = interaction.editingStructuredTextNodeId
    ? byId.get(interaction.editingStructuredTextNodeId)
    : null;
  const selectedTextNode = interaction.structuredTextSelection
    ? byId.get(interaction.structuredTextSelection.nodeId)
    : null;
  const structuredTextSelection =
    interaction.structuredTextSelection && selectedTextNode?.type === "text"
      ? normalizeStructuredTextSelection(
          interaction.structuredTextSelection,
          splitGraphemes(selectedTextNode.text).length
        )
      : null;

  let textCursor = interaction.textCursor;
  if (interaction.editingStructuredTextNodeId && editingNode?.type !== "text") {
    textCursor = null;
  } else if (editingNode?.type === "text" && interaction.textCursor) {
    const previousNode = state.structuredScene.find(
      (node) => node.id === editingNode.id && node.type === "text"
    );
    if (previousNode?.type === "text") {
      const offset = Math.min(
        getStructuredTextOffsetAtPoint(previousNode, interaction.textCursor),
        splitGraphemes(editingNode.text).length
      );
      textCursor = getStructuredTextCaretPoint(editingNode, offset);
    }
  }

  return createCanvasInteractionPatch(interaction, {
    selectedStructuredNodeIds,
    selectedStructuredBoxId: selectedBox?.type === "box" ? selectedBox.id : null,
    selectedStructuredSplitHandle:
      selectedSplit?.type === "splitBox" ? interaction.selectedStructuredSplitHandle : null,
    structuredContextPoint:
      selectedStructuredNodeIds.length === 1 ? interaction.structuredContextPoint : null,
    editingStructuredTextNodeId: editingNode?.type === "text" ? editingNode.id : null,
    structuredTextSelection,
    textCursor,
  });
};

export const createSessionActivationPatch = (
  canvasSessions: CanvasSessionDescriptor[],
  activeCanvasId: string,
  runtime: SessionRuntime,
  contentReader: CanvasSurfaceReader,
  address: CanvasDocumentAddress
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
  ...createDocumentInteractionResetPatch(address),
});

export const createSlideActivationPatch = (
  slideDeck: SlideDeckDescriptor,
  activeReader: CanvasSurfaceReader,
  address: CanvasDocumentAddress
): SlideActivationPatch => ({
  slideDeck,
  contentSurface: createCanvasContentSurface(activeReader),
  ...createDocumentInteractionResetPatch(address),
});
