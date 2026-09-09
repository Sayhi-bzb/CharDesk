import type { StateCreator } from "zustand";
import type { EditorState, DrawingSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";
import { createDocumentInteractionResetPatch } from "../transitions/editorTransitions";

export const createDrawingSlice = (
  documents: CanvasDocumentRegistry
): StateCreator<EditorState, [], [], DrawingSlice> => (set, get) => ({
  clearCanvas: () => {
    documents.mutateGridAt(
      resolveEditorDocumentAddress(documents, get()),
      (grid) => grid.clear()
    );
    set(createDocumentInteractionResetPatch(documents.getActiveAddress()));
  },
});
