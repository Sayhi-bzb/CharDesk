import { describe, expect, it } from "vitest";

import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { createEmptyCanvasInteraction } from "../canvasInteractionState";
import {
  createMovedStaticGridFocusPatch,
  createStaticGridActiveCellPatch,
} from "./staticGridTransitions";

const createState = () => ({
  canvasMode: "freeform" as const,
  contentSurface: new TestCanvasContentSurface([
    ["2,1", { char: "你", color: "#ffffff" }],
    ["4,1", { char: "B", color: "#ffffff" }],
  ]),
  interaction: createEmptyCanvasInteraction({
    documentId: "document-1",
    pageId: "page-1",
  }),
  slideDeck: null,
});

describe("static-grid transitions", () => {
  it("resolves wide-cell navigation without mutating its input", () => {
    const state = createState();
    const initialInteraction = state.interaction;
    const activePatch = createStaticGridActiveCellPatch(state, { x: 3, y: 1 });
    const movedPatch = createMovedStaticGridFocusPatch(
      { ...state, interaction: activePatch.interaction },
      1,
      0
    );

    expect(state.interaction).toBe(initialInteraction);
    expect(state.interaction.staticGridSelection.activeCell).toEqual({ x: 0, y: 0 });
    expect(activePatch.interaction.staticGridSelection.activeCell).toEqual({ x: 2, y: 1 });
    expect(movedPatch.interaction.staticGridSelection.activeCell).toEqual({ x: 4, y: 1 });
    expect(movedPatch.interaction.textCursor).toBeNull();
  });
});
