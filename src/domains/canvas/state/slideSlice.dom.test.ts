import { afterEach, describe, expect, it } from "vitest";
import { defaultCanvasDocuments, useEditorStore } from "@/domains/canvas/testing";
import { GridManager } from "@/shared/utils/grid";
import { createDocumentInteractionResetPatch } from "./transitions/editorTransitions";

const initialState = useEditorStore.getState();

describe("slideSlice", () => {
  afterEach(() => {
    useEditorStore.setState(initialState, true);
  });

  it("keeps each slide grid isolated while switching pages", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(firstSlideId).toBeTruthy();

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set(GridManager.toKey(0, 0), { char: "A", color: "#000" });
    });
    useEditorStore.getState().addSlide();
    const secondSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(secondSlideId).toBeTruthy();
    expect(secondSlideId).not.toBe(firstSlideId);

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set(GridManager.toKey(1, 0), { char: "B", color: "#000" });
    });

    useEditorStore.getState().activateSlide(firstSlideId!);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("1,0")).toBe(false);

    useEditorStore.getState().activateSlide(secondSlideId!);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("0,0")).toBe(false);
  });

  it("keeps slide metadata free of projected cell content", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 2, rows: 1 },
    });
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("1,0", { char: "A", color: "#000" });
      grid.set("2,0", { char: "B", color: "#000" });
    });

    expect(Array.from(useEditorStore.getState().contentSurface.reader.materialize().keys())).toEqual(["1,0", "2,0"]);
    expect(useEditorStore.getState().slideDeck?.slides[0].grid).toEqual([]);
  });

  it("clears document interaction for every active page transition", () => {
    const markDirty = () =>
      useEditorStore.setState({
        textCursor: { x: 1, y: 1 },
        editingStructuredTextNodeId: "stale-text",
        structuredGridFocus: { x: 2, y: 2 },
        staticGridEditMode: "text-edit",
        hoveredGrid: { x: 3, y: 3 },
        scratchLayer: new Map([
          ["0,0", { char: "X", color: "#fff" }],
        ]),
        canvasColorPickerTarget: "auto",
      });
    const expectReset = () =>
      expect(useEditorStore.getState()).toMatchObject(
        createDocumentInteractionResetPatch()
      );

    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    markDirty();
    useEditorStore.getState().addSlide();
    expectReset();
    const secondSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    markDirty();
    useEditorStore.getState().duplicateSlide(secondSlideId);
    expectReset();

    markDirty();
    useEditorStore.getState().activateSlide(firstSlideId);
    expectReset();

    markDirty();
    useEditorStore.getState().resizeSlide(firstSlideId, {
      columns: 5,
      rows: 3,
    });
    expectReset();

    markDirty();
    useEditorStore.getState().removeSlide(firstSlideId);
    expectReset();
  });

  it("preserves interaction for deck metadata and inactive page changes", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    useEditorStore.getState().addSlide();
    const activeSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    useEditorStore.setState({
      hoveredGrid: { x: 2, y: 1 },
      canvasColorPickerTarget: "auto",
    });

    useEditorStore.getState().renameSlide(activeSlideId, "Renamed");
    useEditorStore.getState().moveSlide(activeSlideId, 0);
    useEditorStore.getState().resizeSlide(firstSlideId, {
      columns: 3,
      rows: 2,
    });

    expect(useEditorStore.getState()).toMatchObject({
      hoveredGrid: { x: 2, y: 1 },
      canvasColorPickerTarget: "auto",
    });
  });

  it("keeps deck metadata changes outside the active slide history", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    useEditorStore.getState().addSlide();
    const activeSlideId = useEditorStore.getState().slideDeck?.activeSlideId;
    expect(activeSlideId).toBeTruthy();

    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("0,0", { char: "A", color: "#000" });
    });
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(false);

    useEditorStore.getState().renameSlide(activeSlideId!, "Renamed");
    useEditorStore.getState().moveSlide(activeSlideId!, 0);

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
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("0,0", { char: "A", color: "#000" });
      grid.set("3,1", { char: "B", color: "#000" });
    });

    useEditorStore.getState().resizeSlide(firstSlideId, {
      columns: 6,
      rows: 3,
    });
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().slideDeck?.slides[0].size).toEqual({
      columns: 6,
      rows: 3,
    });

    useEditorStore.getState().resizeSlide(firstSlideId, {
      columns: 3,
      rows: 2,
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("3,1")).toBe(false);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it("crops an inactive slide without changing the active page size", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 4, rows: 2 },
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    defaultCanvasDocuments.mutateGrid((grid) => {
      grid.set("3,1", { char: "A", color: "#000" });
    });
    useEditorStore.getState().addSlide();
    const secondSlideId = useEditorStore.getState().slideDeck!.activeSlideId;

    useEditorStore.getState().resizeSlide(firstSlideId, {
      columns: 3,
      rows: 2,
    });
    expect(
      useEditorStore.getState().slideDeck?.slides.find(
        (slide) => slide.id === secondSlideId
      )?.size
    ).toEqual({ columns: 4, rows: 2 });

    useEditorStore.getState().activateSlide(firstSlideId);
    expect(useEditorStore.getState().contentSurface.reader.materialize().has("3,1")).toBe(false);
  });
});
