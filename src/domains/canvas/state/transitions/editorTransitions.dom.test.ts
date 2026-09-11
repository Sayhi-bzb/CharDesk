import { describe, expect, it } from "vitest";
import { createDocumentInteractionResetPatch } from "./editorTransitions";

describe("editor transitions", () => {
  it("creates a complete document interaction reset", () => {
    const address = { documentId: "document", pageId: "page" };
    expect(createDocumentInteractionResetPatch(address)).toEqual({
      interaction: {
        address,
        textCursor: null,
        staticGridSelection: {
          mode: "cell",
          activeCell: { x: 0, y: 0 },
          anchorCell: { x: 0, y: 0 },
          primaryRange: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
          additionalRanges: [],
        },
        staticGridEditMode: "navigate",
        staticGridInputSession: null,
        hoveredGrid: null,
        scratchLayer: null,
        canvasColorPickerTarget: null,
      },
    });
  });

  it("does not share mutable reset values between transitions", () => {
    const address = { documentId: "document", pageId: "page" };
    const first = createDocumentInteractionResetPatch(address).interaction;
    const second = createDocumentInteractionResetPatch(address).interaction;

    expect(first.staticGridSelection).not.toBe(second.staticGridSelection);
    expect(first.staticGridSelection.activeCell).not.toBe(
      second.staticGridSelection.activeCell
    );
    expect(first.staticGridSelection.primaryRange).not.toBe(
      second.staticGridSelection.primaryRange
    );
    expect(first.staticGridSelection.additionalRanges).not.toBe(
      second.staticGridSelection.additionalRanges
    );
  });
});
