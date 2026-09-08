import { describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import type { EditorState } from "./interfaces";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import {
  createPersistedEditorSnapshot,
  syncHydratedStateToCanvasDocument,
} from "./editorPersistence";
import { useEditorStore } from "@/domains/canvas/testing";

describe("syncHydratedStateToCanvasDocument", () => {
  it("restores only authoritative structured maps into Yjs", () => {
    const documents = new CanvasDocumentRegistry("hydration-initial");
    const scene: EditorState["structuredScene"] = [
      {
        id: "hydrated-text",
        type: "text",
        order: 1,
        position: { x: 2, y: 3 },
        text: "Hydrated",
        style: { color: "#111111" },
      },
    ];
    const hydratedState: EditorState = {
      ...useEditorStore.getState(),
      activeCanvasId: "hydrated-structured",
      canvasMode: "structured",
      structuredScene: scene,
      structuredComponents: [],
      contentSurface: new TestCanvasContentSurface([
        ["2,3", { char: "H", color: "#111111" }],
      ]),
      canvasSessions: [
        {
          id: "hydrated-structured",
          name: "Hydrated Structured",
          mode: "structured",
        },
      ],
    };

    syncHydratedStateToCanvasDocument(documents, hydratedState, {
      id: "hydrated-structured",
      name: "Hydrated Structured",
      mode: "structured",
      scene,
      components: [],
      grid: [],
    });

    expect(documents.getContentReader().materialize()).toEqual(new Map());
    expect(documents.yStructuredScene.get("hydrated-text")).toEqual(scene[0]);
    documents.dispose();
  });

  it("persists a structured scene without a duplicate cell grid", () => {
    const state = useEditorStore.getState();
    const structuredState: EditorState = {
      ...state,
      canvasMode: "structured",
      structuredScene: [
        {
          id: "persisted-text",
          type: "text",
          order: 1,
          position: { x: 2, y: 3 },
          text: "Persisted",
          style: { color: "#111111" },
        },
      ],
      structuredComponents: [],
    };
    const documents = new CanvasDocumentRegistry(state.activeCanvasId);
    documents.activateDocument(state.activeCanvasId, {
      mode: "structured",
      grid: [],
      scene: structuredState.structuredScene,
      components: [],
    }, { replace: true });

    const snapshot = createPersistedEditorSnapshot(structuredState, documents);

    expect(snapshot.workspace.structuredScene).toHaveLength(1);
    expect(snapshot.workspace.grid).toEqual([]);
    expect(
      snapshot.sessions.items.find((session) => session.id === state.activeCanvasId)?.grid
    ).toEqual([]);
    documents.dispose();
  });

  it("persists source-backed sessions as metadata-only shells", () => {
    const state = useEditorStore.getState();
    const sourceState: EditorState = {
      ...state,
      activeCanvasId: "source-board",
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([["0,0", { char: "A", color: "#111111" }]]),
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
