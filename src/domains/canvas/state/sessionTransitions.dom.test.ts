import { afterEach, describe, expect, it } from "vitest";
import { canvasCommands, setCanvasTestState, useEditorStore } from "@/domains/canvas/testing";
import {
  applyFreeformSnapshotToYMaps,
  defaultCanvasDocuments,
} from "@/domains/canvas/testing";
import { createDocumentInteractionResetPatch } from "./transitions/editorTransitions";

const initialState = useEditorStore.getState();

const markDocumentInteractionDirty = () => {
  setCanvasTestState({
    textCursor: { x: 3, y: 4 },
    editingStructuredTextNodeId: "text-node",
    structuredTextSelection: {
      nodeId: "text-node",
      anchor: 1,
      focus: 2,
    },
    selectedStructuredNodeIds: ["node"],
    selectedStructuredBoxId: "box",
    selectedStructuredSplitHandle: {
      nodeId: "split-box",
      handle: { kind: "line", splitId: "split" } as never,
    },
    structuredContextPoint: { x: 5, y: 6 },
    structuredGridFocus: { x: 7, y: 8 },
    staticGridSelection: {
      mode: "range",
      activeCell: { x: 9, y: 9 },
      anchorCell: { x: 8, y: 8 },
      primaryRange: { start: { x: 8, y: 8 }, end: { x: 9, y: 9 } },
      additionalRanges: [],
    },
    staticGridEditMode: "text-edit",
    hoveredGrid: { x: 10, y: 10 },
    scratchLayer: new Map([
      ["0,0", { char: "X", color: "#fff" }],
    ]),
    canvasColorPickerTarget: "auto",
  });
};

const expectDocumentInteractionReset = () => {
  const state = useEditorStore.getState();
  const reset = createDocumentInteractionResetPatch(
    defaultCanvasDocuments.getActiveAddress()
  );
  expect(state).toMatchObject(reset);
  expect(state.interaction).toMatchObject(reset.interaction);
  expect(state.interaction.address).toEqual(defaultCanvasDocuments.getActiveAddress());
};

describe("session transitions", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
    applyFreeformSnapshotToYMaps([]);
  });

  it("clears document interaction when creating a session", () => {
    markDocumentInteractionDirty();
    useEditorStore.getState().createCanvasSession("freeform");
    expectDocumentInteractionReset();
  });

  it("clears document interaction when switching sessions", () => {
    const firstSessionId = useEditorStore.getState().activeCanvasId;
    useEditorStore.getState().createCanvasSession("freeform");
    markDocumentInteractionDirty();

    useEditorStore.getState().switchCanvasSession(firstSessionId);
    expectDocumentInteractionReset();
  });

  it("clears document interaction when removing the active session", () => {
    useEditorStore.getState().createCanvasSession("freeform");
    const activeSessionId = useEditorStore.getState().activeCanvasId;
    markDocumentInteractionDirty();

    useEditorStore.getState().removeCanvasSession(activeSessionId);
    expectDocumentInteractionReset();
  });

  it("preserves the page-scoped interaction snapshot for metadata changes", () => {
    markDocumentInteractionDirty();
    const before = useEditorStore.getState().interaction;

    useEditorStore.getState().renameCanvasSession(
      useEditorStore.getState().activeCanvasId,
      "Renamed"
    );

    expect(useEditorStore.getState().interaction).toBe(before);
  });

  it("preserves Hand while entering and restoring a structured session", () => {
    useEditorStore.getState().createCanvasSession("structured");
    const structuredSessionId = useEditorStore.getState().activeCanvasId;

    canvasCommands.tools.set("pan");
    expect(useEditorStore.getState()).toMatchObject({
      canvasMode: "structured",
      tool: "pan",
    });

    useEditorStore.getState().createCanvasSession("freeform");
    useEditorStore.getState().switchCanvasSession(structuredSessionId);
    expect(useEditorStore.getState()).toMatchObject({
      canvasMode: "structured",
      tool: "pan",
    });
  });

  it("restores structured content from the document without caching it in the session", () => {
    const freeformSessionId = useEditorStore.getState().activeCanvasId;
    useEditorStore.getState().createCanvasSession("structured");
    const structuredSessionId = useEditorStore.getState().activeCanvasId;
    useEditorStore.getState().applyStructuredScene([
      {
        id: "cached-text",
        type: "text",
        order: 1,
        position: { x: 2, y: 3 },
        text: "Cached",
        style: { color: "#111111" },
      },
    ]);
    const projectedSession = useEditorStore
      .getState()
      .canvasSessions.find((session) => session.id === structuredSessionId)!;

    useEditorStore.getState().switchCanvasSession(freeformSessionId);
    useEditorStore.getState().switchCanvasSession(structuredSessionId);

    const restored = useEditorStore.getState();
    expect(projectedSession).not.toHaveProperty("scene");
    expect(restored.structuredScene).toEqual([
      expect.objectContaining({ id: "cached-text", text: "Cached" }),
    ]);
    expect(restored.contentSurface.reader.get({ x: 2, y: 3 })?.char).toBe("C");
    expect(
      defaultCanvasDocuments
        .getCollaborationDocument(structuredSessionId)
        ?.getMap("main-grid").size
    ).toBe(0);
  });

  it("derives a structured grid from the document without retaining a session cache", () => {
    const freeformSessionId = useEditorStore.getState().activeCanvasId;
    const structuredSessionId = `structured-cache-${crypto.randomUUID()}`;
    const scene = [
      {
        id: "cache-text",
        type: "text" as const,
        order: 1,
        position: { x: 4, y: 5 },
        text: "Repair",
        style: { color: "#111111" },
      },
    ];
    defaultCanvasDocuments.activateDocument(structuredSessionId, {
      grid: [],
      scene,
      components: [],
    });
    useEditorStore.setState((state) => ({
      canvasSessions: [
        ...state.canvasSessions,
        {
          id: structuredSessionId,
          name: "Structured Cache",
          mode: "structured",
        },
      ],
    }));

    useEditorStore.getState().switchCanvasSession(structuredSessionId);
    const repaired = useEditorStore
      .getState()
      .canvasSessions.find((session) => session.id === structuredSessionId)!;
    expect(repaired).not.toHaveProperty("grid");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("4,5")?.char).toBe("R");

    useEditorStore.getState().switchCanvasSession(freeformSessionId);
    useEditorStore.getState().switchCanvasSession(structuredSessionId);
    const restored = useEditorStore
      .getState()
      .canvasSessions.find((session) => session.id === structuredSessionId)!;
    expect(restored).not.toHaveProperty("grid");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("4,5")?.char).toBe("R");
  });
});
