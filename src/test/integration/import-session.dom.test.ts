import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import {
  applyFreeformSnapshotToYMaps,
  defaultCanvasDocuments,
  testingCanvasRuntime,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import { DEFAULT_SESSION_ID } from "@/domains/canvas/state/helpers/storeUtils";
import { createDocumentInteractionResetPatch } from "@/domains/canvas/state/transitions/editorTransitions";
import { createStaticGridInputSession } from "@/domains/selection/public";

describe("importCanvasSession", () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    useEditorStore.setState(
      {
        ...initialState,
        contentSurface: new TestCanvasContentSurface(),
        canvasSessions: initialState.canvasSessions.map((session) =>
          session.id === DEFAULT_SESSION_ID ? { ...session, grid: [] } : session
        ),
      },
      true
    );
    applyFreeformSnapshotToYMaps([]);
  });

  it("imports CharDesk text into a new active session", async () => {
    const sessionCount = useEditorStore.getState().canvasSessions.length;
    const session = await useEditorStore.getState().importCanvasSession(
      "[38;2;255;0;0mA[0m  \n  [38;2;0;255;0mB[0m"
    );

    const state = useEditorStore.getState();
    expect(session.name).toBe("Imported Canvas");
    expect(state.canvasSessions).toHaveLength(sessionCount + 1);
    expect(state.activeCanvasId).toBe(session.id);
    expect(state.canvasMode).toBe("freeform");
    expect(state.contentSurface.reader.materialize().get("0,0")).toEqual({ char: "A", color: "#ff0000" });
    expect(state.contentSurface.reader.materialize().get("2,1")).toEqual({ char: "B", color: "#00ff00" });
    expect(testingCanvasRuntime.viewport.getPendingPlacement()).toEqual({
      sessionId: session.id,
      kind: "content-start",
    });

    testingCanvasRuntime.commands.viewport.consumePendingPlacement(session.id);
    expect(testingCanvasRuntime.viewport.getPendingPlacement()).toBeNull();
  });

  it("clears document interaction when importing a session", async () => {
    setCanvasTestState({
      staticGrid: {
        mode: "text-edit",
        session: createStaticGridInputSession({ origin: { x: 3, y: 4 } }),
      },
      hoveredGrid: { x: 7, y: 8 },
      scratchLayer: new Map([
        ["0,0", { char: "X", color: "#fff" }],
      ]),
      canvasColorPickerTarget: "auto",
    });

    await useEditorStore.getState().importCanvasSession("");

    expect(useEditorStore.getState()).toMatchObject(
      createDocumentInteractionResetPatch(
        defaultCanvasDocuments.getActiveAddress()
      )
    );
  });
  it("imports an Agent-generated CharDesk document as a new active Slide Deck", async () => {
    const before = useEditorStore.getState();
    const session = await before.importCanvasSession(
      [
        "---",
        "chardesk: document/v1",
        "mode: slide",
        "title: Agent Deck",
        "---",
        "## Intro",
        "```text",
        " A",
        "```",
        "## Next",
        "```chardesk",
        "[31mR[0m",
        "```",
      ].join("\n")
    );

    const state = useEditorStore.getState();
    expect(session).toMatchObject({ mode: "slide", name: "Agent Deck" });
    expect(state.canvasSessions.some((item) => item.id === before.activeCanvasId)).toBe(true);
    expect(state.activeCanvasId).toBe(session.id);
    expect(state.canvasMode).toBe("slide");
    expect(state.slideDeck?.slides.map((slide) => slide.name)).toEqual([
      "Intro",
      "Next",
    ]);
    expect(state.slideDeck?.slides.map((slide) => slide.size)).toEqual([
      { columns: 100, rows: 27 },
      { columns: 100, rows: 27 },
    ]);
    expect(state.contentSurface.reader.materialize().get("1,0")).toMatchObject({ char: "A" });
    expect(testingCanvasRuntime.viewport.getPendingPlacement()).toBeNull();
  });

  it("does not mutate sessions when the payload is invalid", async () => {
    const before = useEditorStore.getState();
    const activeCanvasId = before.activeCanvasId;
    const sessionCount = before.canvasSessions.length;

    await expect(
      useEditorStore
        .getState()
        .importCanvasSession('{"type":"chardesk-document","version":1}')
    ).rejects.toThrow("Legacy JSON");

    const after = useEditorStore.getState();
    expect(after.activeCanvasId).toBe(activeCanvasId);
    expect(after.canvasSessions).toHaveLength(sessionCount);
  });
});
