import { afterEach, describe, expect, it } from "vitest";
import {
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import { createStaticGridInputSession } from "@/domains/selection/public";
import { GridManager } from "@/shared/utils/grid";
import { createDocumentInteractionResetPatch } from "./transitions/editorTransitions";

const initialState = useEditorStore.getState();

describe("Canvas slide commands", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
  });

  it("keeps each slide grid isolated while switching pages", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(firstSlideId).toBeTruthy();

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set(GridManager.toKey(0, 0), { char: "A", color: "#000" });
    });
    canvasCommands.slides.add();
    const secondSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(secondSlideId).toBeTruthy();
    expect(secondSlideId).not.toBe(firstSlideId);

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set(GridManager.toKey(1, 0), { char: "B", color: "#000" });
    });

    canvasCommands.slides.activate(firstSlideId!);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("1,0")).toBe(false);

    canvasCommands.slides.activate(secondSlideId!);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("0,0")).toBe(false);
  });

  it("keeps slide metadata free of projected cell content", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 2, rows: 1 },
    });
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("1,0", { char: "A", color: "#000" });
      grid.set("2,0", { char: "B", color: "#000" });
    });

    expect(Array.from(useEditorStore.getState().contentSurface.reader.materialize().keys())).toEqual(["1,0", "2,0"]);
    expect(useEditorStore.getState().slideDeck?.slides[0]).not.toHaveProperty("grid");
  });

  it("clears document interaction for every active page transition", () => {
    const markDirty = () =>
      setCanvasTestState({
        staticGrid: {
          mode: "text-edit",
          session: createStaticGridInputSession({ origin: { x: 1, y: 1 } }),
        },
        hoveredGrid: { x: 3, y: 3 },
        scratchLayer: new Map([
          ["0,0", { char: "X", color: "#fff" }],
        ]),
        canvasColorPickerTarget: "auto",
      });
    const expectReset = () =>
      expect(useEditorStore.getState()).toMatchObject(
        createDocumentInteractionResetPatch(
          defaultCanvasDocuments.getActiveAddress()
        )
      );

    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    markDirty();
    canvasCommands.slides.add();
    expectReset();
    const secondSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    markDirty();
    canvasCommands.slides.duplicate(secondSlideId);
    expectReset();

    markDirty();
    canvasCommands.slides.activate(firstSlideId);
    expectReset();

    markDirty();
    canvasCommands.slides.resize(firstSlideId, {
      columns: 5,
      rows: 3,
    });
    expectReset();

    markDirty();
    canvasCommands.slides.remove(firstSlideId);
    expectReset();
  });

  it("preserves interaction for deck metadata and inactive page changes", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    canvasCommands.slides.add();
    const activeSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    setCanvasTestState({
      hoveredGrid: { x: 2, y: 1 },
      canvasColorPickerTarget: "auto",
    });

    canvasCommands.slides.rename(activeSlideId, "Renamed");
    canvasCommands.slides.move(activeSlideId, 0);
    canvasCommands.slides.resize(firstSlideId, {
      columns: 3,
      rows: 2,
    });

    expect(useEditorStore.getState().interaction).toMatchObject({
      hoveredGrid: { x: 2, y: 1 },
      canvasColorPickerTarget: "auto",
    });
  });

  it("keeps deck metadata changes outside the active slide history", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    canvasCommands.slides.add();
    const activeSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(activeSlideId).toBeTruthy();

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("0,0", { char: "A", color: "#000" });
    });
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(false);

    canvasCommands.slides.rename(activeSlideId!, "Renamed");
    canvasCommands.slides.move(activeSlideId!, 0);

    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(false);
    expect(defaultCanvasDocuments.undo()).toBe(true);
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("0,0")).toBe(false);
    expect(
      useEditorStore.getState().slideDeck?.slides.find((slide) => slide.id === activeSlideId)?.name
    ).toBe("Renamed");
    expect(useEditorStore.getState().slideDeck?.slides[0].id).toBe(activeSlideId);
  });

  it("resizes one slide and clears history only when content is cropped", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("0,0", { char: "A", color: "#000" });
      grid.set("3,1", { char: "B", color: "#000" });
    });

    canvasCommands.slides.resize(firstSlideId, {
      columns: 6,
      rows: 3,
    });
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().slideDeck?.slides[0].size).toEqual({
      columns: 6,
      rows: 3,
    });

    canvasCommands.slides.resize(firstSlideId, {
      columns: 3,
      rows: 2,
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("3,1")).toBe(false);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it("crops an inactive slide without changing the active page size", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("3,1", { char: "A", color: "#000" });
    });
    canvasCommands.slides.add();
    const secondSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    canvasCommands.slides.resize(firstSlideId, {
      columns: 3,
      rows: 2,
    });
    expect(
      useEditorStore.getState().slideDeck?.slides.find(
        (slide) => slide.id === secondSlideId
      )?.size
    ).toEqual({ columns: 4, rows: 2 });

    canvasCommands.slides.activate(firstSlideId);
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("3,1")).toBe(false);
  });
});
