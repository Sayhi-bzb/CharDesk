import { describe, expect, it } from "vitest";
import { TestCanvasContentSurface, useEditorStore } from "@/domains/canvas/testing";
import type { EditorState } from "./interfaces";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import {
  createPersistedEditorSnapshot,
  syncHydratedStateToCanvasDocument,
} from "./editorPersistence";

describe("editor persistence", () => {
  it("hydrates the active CellPlane into the document registry", () => {
    const documents = new CanvasDocumentRegistry("hydration-initial");
    const hydratedState: EditorState = {
      ...useEditorStore.getState(),
      activeCanvasId: "hydrated-freeform",
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([
        ["2,3", { char: "H", color: "#111111" }],
      ]),
      canvasSessions: [{
        id: "hydrated-freeform",
        name: "Hydrated",
        mode: "freeform",
      }],
    };

    syncHydratedStateToCanvasDocument(documents, hydratedState, {
      id: "hydrated-freeform",
      name: "Hydrated",
      mode: "freeform",
      grid: [["2,3", { char: "H", color: "#111111" }]],
    });

    expect(documents.getContentReader().getCell({ x: 2, y: 3 })?.char).toBe("H");
    documents.dispose();
  });

  it("persists source-backed sessions as metadata-only shells", () => {
    const state = useEditorStore.getState();
    const sourceState: EditorState = {
      ...state,
      activeCanvasId: "source-board",
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "A", color: "#111111" }],
      ]),
      canvasSessions: [{
        id: "source-board",
        name: "Board",
        mode: "freeform",
        sourceBinding: {
          kind: "blackboard",
          provider: "browser-workspace",
          id: "workspace-1",
        },
      }],
    };
    const documents = new CanvasDocumentRegistry("source-board");

    const snapshot = createPersistedEditorSnapshot(sourceState, documents);

    expect(snapshot.workspace.grid).toEqual([]);
    expect(snapshot.sessions.items[0]).toMatchObject({
      sourceBinding: { id: "workspace-1" },
      grid: [],
    });
    documents.dispose();
  });
});
