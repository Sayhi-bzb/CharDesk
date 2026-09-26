import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import * as Y from "yjs";
import { defaultCanvasDocuments, useEditorStore } from "@/domains/canvas/testing";
import {
  gridEntriesToCellPlaneOperation,
  type CellPlaneOperation,
} from "../cell-plane/model";

const initialState = useEditorStore.getState();
const cell = (char: string) => ({ char, color: "#000000" });

describe("remote canvas document projection", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
    defaultCanvasDocuments.activateDocument(
      initialState.activeCanvasId,
      { grid: Array.from(initialState.contentSurface.reader.materialize()) },
      { replace: true }
    );
  });

  it("preserves remote grid content when the local client makes its next edit", () => {
    const sessionId = `projection-${crypto.randomUUID()}`;
    useEditorStore.setState({
      activeCanvasId: sessionId,
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: [{ id: sessionId, name: "Projection", mode: "freeform" }],
    });
    defaultCanvasDocuments.activateDocument(sessionId, { grid: [] });
    const local = defaultCanvasDocuments.getCollaborationDocument(sessionId)!;
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const pageId = remote.getArray<string>("document-page-order").get(0)!;
    const remoteSeed = gridEntriesToCellPlaneOperation("remote-seed", [
      ["0,0", cell("R")],
      ["1,0", cell("S")],
    ]);
    if (remoteSeed) {
      remote
        .getArray<CellPlaneOperation>(
          `canvas-page:${encodeURIComponent(pageId)}:cell-plane-operations`
        )
        .push([remoteSeed]);
    }

    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
    defaultCanvasDocuments.mutateGrid((grid) => grid.set("2,0", cell("L")));

    expect(Object.fromEntries(useEditorStore.getState().contentSurface.reader.materialize())).toEqual({
      "0,0": cell("R"),
      "1,0": cell("S"),
      "2,0": cell("L"),
    });
    remote.destroy();
  });

  it("publishes one committed projection for a remote transaction", () => {
    const local = defaultCanvasDocuments.getCollaborationDocument(
      useEditorStore.getState().activeCanvasId
    )!;
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const pageId = remote.getArray<string>("document-page-order").get(0)!;
    const operation = gridEntriesToCellPlaneOperation("remote-commit", [
      ["7,4", cell("R")],
    ]);
    const observed: typeof initialState[] = [];
    const unsubscribe = useEditorStore.subscribe((state) => observed.push(state));

    if (operation) {
      remote
        .getArray<CellPlaneOperation>(
          `canvas-page:${encodeURIComponent(pageId)}:cell-plane-operations`
        )
        .push([operation]);
    }
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize().get("7,4")?.char).toBe("R");
    remote.destroy();
  });
});
