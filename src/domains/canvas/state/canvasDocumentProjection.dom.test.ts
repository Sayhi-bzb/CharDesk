import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import * as Y from "yjs";
import type { StructuredNode } from "@/domains/structured-content/public";
import { defaultCanvasDocuments, useEditorStore } from "@/domains/canvas/testing";
import {
  gridEntriesToCellPlaneOperation,
  isIncrementalCanvasSurfaceReader,
  type CellPlaneOperation,
} from "../cell-plane/model";

const initialState = useEditorStore.getState();
const cell = (char: string) => ({ char, color: "#000000" });
const textNode = (id: string, text: string) => ({
  id,
  type: "text" as const,
  order: 1,
  position: { x: 2, y: 3 },
  text,
  style: { color: "#ffffff" },
});

describe("remote canvas document projection", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
    defaultCanvasDocuments.activateDocument(
      initialState.activeCanvasId,
      {
        grid: Array.from(initialState.contentSurface.reader.materialize()),
        scene: initialState.structuredScene,
        components: initialState.structuredComponents,
      },
      { replace: true }
    );
  });

  it("preserves remote grid content when the local client makes its next edit", () => {
    const sessionId = `projection-${crypto.randomUUID()}`;
    useEditorStore.setState({
      activeCanvasId: sessionId,
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: [
        {
          id: sessionId,
          name: "Projection",
          mode: "freeform",
          grid: [],
          scene: [],
          components: [],
        },
      ],
    });
    defaultCanvasDocuments.activateDocument(sessionId, { grid: [], scene: [], components: [] });
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
  });

  it("projects one local structured transaction exactly once", () => {
    const sessionId = `structured-local-${crypto.randomUUID()}`;
    useEditorStore.setState({
      activeCanvasId: sessionId,
      canvasMode: "structured",
      structuredScene: [],
      structuredComponents: [],
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: [
        {
          id: sessionId,
          name: "Structured Local",
          mode: "structured",
          grid: [],
          scene: [],
          components: [],
        },
      ],
    });
    defaultCanvasDocuments.activateDocument(sessionId, { grid: [], scene: [], components: [] });
    let projectionCount = 0;
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.structuredScene !== previous.structuredScene) projectionCount += 1;
    });

    useEditorStore.getState().applyStructuredScene([textNode("local-text", "Local")]);
    unsubscribe();

    const state = useEditorStore.getState();
    expect(projectionCount).toBe(1);
    expect(state.structuredScene).toEqual([textNode("local-text", "Local")]);
    expect(state.contentSurface.reader.materialize().get("2,3")?.char).toBe("L");
    expect(state.canvasSessions[0].scene).toEqual([]);
  });

  it("writes only the changed structured node for an immutable scene edit", () => {
    const sessionId = `structured-patch-${crypto.randomUUID()}`;
    useEditorStore.setState({
      activeCanvasId: sessionId,
      canvasMode: "structured",
      structuredScene: [],
      structuredComponents: [],
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: [
        {
          id: sessionId,
          name: "Structured Patch",
          mode: "structured",
          grid: [],
          scene: [],
          components: [],
        },
      ],
    });
    defaultCanvasDocuments.activateDocument(sessionId, {
      mode: "structured",
      grid: [],
      scene: [],
      components: [],
    });
    useEditorStore.getState().applyStructuredScene(
      Array.from({ length: 1_000 }, (_, index) => ({
        ...textNode(`node-${index}`, `Text ${index}`),
        order: index,
      }))
    );
    const projectedReader = useEditorStore.getState().contentSurface.reader;
    const projectedRevision = isIncrementalCanvasSurfaceReader(projectedReader)
      ? projectedReader.getRevision()
      : -1;

    const changedKeys = new Set<string>();
    const observer = (event: Y.YMapEvent<StructuredNode>) => {
      event.keysChanged.forEach((key) => changedKeys.add(key));
    };
    defaultCanvasDocuments.yStructuredScene.observe(observer);
    const currentScene = useEditorStore.getState().structuredScene;
    useEditorStore.getState().applyStructuredScene(
      currentScene.map((node) =>
        node.id === "node-500" && node.type === "text"
          ? { ...node, text: "Changed" }
          : node
      )
    );
    defaultCanvasDocuments.yStructuredScene.unobserve(observer);

    expect(changedKeys).toEqual(new Set(["node-500"]));
    expect(useEditorStore.getState().contentSurface.reader).toBe(projectedReader);
    expect(
      isIncrementalCanvasSurfaceReader(projectedReader) &&
        projectedReader.getRevision()
    ).toBe(projectedRevision + 1);
    expect(
      useEditorStore.getState().structuredScene.find((node) => node.id === "node-500")
    ).toMatchObject({ text: "Changed" });
  });

  it("projects one remote structured transaction exactly once", () => {
    const sessionId = `structured-remote-${crypto.randomUUID()}`;
    useEditorStore.setState({
      activeCanvasId: sessionId,
      canvasMode: "structured",
      structuredScene: [],
      structuredComponents: [],
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: [
        {
          id: sessionId,
          name: "Structured Remote",
          mode: "structured",
          grid: [],
          scene: [],
          components: [],
        },
      ],
    });
    defaultCanvasDocuments.activateDocument(sessionId, {
      mode: "structured",
      grid: [],
      scene: [],
      components: [],
    });
    const local = defaultCanvasDocuments.getCollaborationDocument(sessionId)!;
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const pageId = remote.getArray<string>("document-page-order").get(0)!;
    remote
      .getMap(`canvas-page:${encodeURIComponent(pageId)}:structured-scene`)
      .set("remote-text", textNode("remote-text", "Remote"));
    let projectionCount = 0;
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.structuredScene !== previous.structuredScene) projectionCount += 1;
    });

    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
    unsubscribe();

    const state = useEditorStore.getState();
    expect(projectionCount).toBe(1);
    expect(state.structuredScene).toEqual([textNode("remote-text", "Remote")]);
    expect(state.contentSurface.reader.materialize().get("2,3")?.char).toBe("R");
    expect(state.canvasSessions[0].scene).toEqual([]);
  });
});
