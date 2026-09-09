import { describe, expect, it } from "vitest";

import { createEmptyCanvasInteraction } from "../canvasInteractionState";
import {
  createAddedScratchPointsPatch,
  createClearedScratchLayerPatch,
  createScratchLayerPatch,
  createShapeScratchLayerPatch,
} from "./scratchLayerTransitions";

const createState = () => ({
  canvasMode: "freeform" as const,
  brushColor: "#111111",
  brushBackgroundColor: "#abcdef",
  interaction: createEmptyCanvasInteraction({
    documentId: "document-1",
    pageId: "page-1",
  }),
});

describe("scratch-layer transitions", () => {
  it("replaces the layer while preserving styled cells", () => {
    const state = createState();
    const patch = createScratchLayerPatch(state, [
      {
        x: 2,
        y: 3,
        char: "A",
        bgColor: "#222222",
        attrs: { bold: true },
        href: "https://example.com",
      },
    ]);

    expect(patch.interaction.scratchLayer).toEqual(
      new Map([
        [
          "2,3",
          {
            char: "A",
            color: "#111111",
            bgColor: "#222222",
            attrs: { bold: true },
            href: "https://example.com",
          },
        ],
      ])
    );
    expect(state.interaction.scratchLayer).toBeNull();
    expect(createScratchLayerPatch(state, []).interaction.scratchLayer).toEqual(
      new Map()
    );
  });

  it("appends through a new map without mutating the current layer", () => {
    const currentLayer = new Map([
      ["0,0", { char: "A", color: "#ffffff" }],
    ]);
    const initialState = createState();
    const state = {
      ...initialState,
      interaction: {
        ...initialState.interaction,
        scratchLayer: currentLayer,
      },
    };
    const patch = createAddedScratchPointsPatch(state, [
      { x: 1, y: 0, char: "B" },
    ]);

    expect(patch.interaction.scratchLayer).not.toBe(currentLayer);
    expect(currentLayer).toEqual(
      new Map([["0,0", { char: "A", color: "#ffffff" }]])
    );
    expect(patch.interaction.scratchLayer).toEqual(
      new Map([
        ["0,0", { char: "A", color: "#ffffff" }],
        ["1,0", { char: "B", color: "#111111" }],
      ])
    );
  });

  it("uses the static-grid background color for background previews", () => {
    const patch = createShapeScratchLayerPatch(
      createState(),
      "bg",
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    );

    expect(patch.interaction.scratchLayer?.size).toBe(4);
    expect(patch.interaction.scratchLayer?.get("0,0")).toEqual({
      char: " ",
      color: "#000000",
      bgColor: "#abcdef",
    });

    const structuredPatch = createShapeScratchLayerPatch(
      { ...createState(), canvasMode: "structured" },
      "bg",
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    );
    expect(structuredPatch.interaction.scratchLayer?.get("0,0")?.bgColor).toBe(
      "#111111"
    );
  });

  it.each(["box", "splitBox", "circle", "stepline", "line", "arrowLine"] as const)(
    "routes %s through the shape preview",
    (tool) => {
      const patch = createShapeScratchLayerPatch(
        createState(),
        tool,
        { x: 0, y: 0 },
        { x: 6, y: 4 },
        { axis: "vertical" }
      );

      expect(patch.interaction.scratchLayer?.size).toBeGreaterThan(0);
    }
  );

  it("clears the layer without changing the input snapshot", () => {
    const state = createState();
    const patch = createClearedScratchLayerPatch(state.interaction);

    expect(patch.interaction.scratchLayer).toBeNull();
    expect(state.interaction.scratchLayer).toBeNull();
    expect(patch.interaction).not.toBe(state.interaction);
  });
});
