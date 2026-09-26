import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  testingCanvasRuntime,
  useEditorStore,
} from "@/domains/canvas/testing";
import { DEFAULT_SESSION_ID } from "@/domains/canvas/state/helpers/storeUtils";

const initialState = useEditorStore.getState();

describe("canvas session viewport state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState({
      ...initialState,
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: initialState.canvasSessions.map((session) =>
        session.id === DEFAULT_SESSION_ID
          ? { ...session, grid: [], viewport: undefined }
          : session
      ),
    });
    testingCanvasRuntime.viewport.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });
    applyFreeformSnapshotToYMaps([]);
  });

  it("commits offset and zoom as one viewport state transition", () => {
    const snapshots: Array<{ offset: { x: number; y: number }; zoom: number }> = [];
    const unsubscribe = testingCanvasRuntime.viewport.subscribe(() => {
      snapshots.push(testingCanvasRuntime.viewport.getSnapshot());
    });
    testingCanvasRuntime.commands.viewport.setViewport(() => ({
      offset: { x: -80, y: -40 },
      zoom: 2,
    }));
    unsubscribe();
    expect(snapshots).toEqual([{ offset: { x: -80, y: -40 }, zoom: 2 }]);
  });

  it("saves and restores offset and zoom per canvas session", async () => {
    testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: 10, y: 20 }));
    testingCanvasRuntime.commands.viewport.setZoom(() => 2);
    canvasCommands.sessions.create("freeform");
    const secondCanvasId = useEditorStore.getState().activeCanvasId;

    testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: 100, y: 200 }));
    testingCanvasRuntime.commands.viewport.setZoom(() => 3);
    await canvasCommands.sessions.switch(DEFAULT_SESSION_ID);
    expect(testingCanvasRuntime.viewport.getSnapshot()).toEqual({
      offset: { x: 10, y: 20 },
      zoom: 2,
    });

    await canvasCommands.sessions.switch(secondCanvasId);
    expect(testingCanvasRuntime.viewport.getSnapshot()).toEqual({
      offset: { x: 100, y: 200 },
      zoom: 3,
    });
  });
});
