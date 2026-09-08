import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { applyFreeformSnapshotToYMaps, useEditorStore } from "@/domains/canvas/testing";
import { DEFAULT_SESSION_ID } from "@/domains/canvas/state/helpers/storeUtils";
import { createDocumentInteractionResetPatch } from "@/domains/canvas/state/transitions/editorTransitions";

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
    expect(state.pendingCameraPlacement).toEqual({
      sessionId: session.id,
      kind: "content-start",
    });

    state.consumePendingCameraPlacement(session.id);
    expect(useEditorStore.getState().pendingCameraPlacement).toBeNull();
  });

  it("clears document interaction when importing a session", async () => {
    useEditorStore.setState({
      textCursor: { x: 3, y: 4 },
      structuredGridFocus: { x: 5, y: 6 },
      staticGridEditMode: "text-edit",
      hoveredGrid: { x: 7, y: 8 },
      scratchLayer: new Map([
        ["0,0", { char: "X", color: "#fff" }],
      ]),
      canvasColorPickerTarget: "auto",
    });

    await useEditorStore.getState().importCanvasSession("");

    expect(useEditorStore.getState()).toMatchObject(
      createDocumentInteractionResetPatch()
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
    expect(state.pendingCameraPlacement).toBeNull();
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
