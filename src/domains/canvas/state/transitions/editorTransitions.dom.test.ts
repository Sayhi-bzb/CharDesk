import { describe, expect, it } from "vitest";
import { getStaticGridSelection } from "@/domains/selection/public";
import { createDocumentInteractionResetPatch } from "./editorTransitions";

describe("editor transitions", () => {
  it("creates a complete document interaction reset", () => {
    const address = { documentId: "document", pageId: "page" };
    expect(createDocumentInteractionResetPatch(address)).toEqual({
      interaction: {
        address,
        staticGrid: {
          mode: "navigate",
          selection: {
            mode: "cell",
            activeCell: { x: 0, y: 0 },
            anchorCell: { x: 0, y: 0 },
            primaryRange: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
            additionalRanges: [],
          },
        },
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

    const firstSelection = getStaticGridSelection(first.staticGrid);
    const secondSelection = getStaticGridSelection(second.staticGrid);
    expect(firstSelection).not.toBe(secondSelection);
    expect(firstSelection.activeCell).not.toBe(
      secondSelection.activeCell
    );
    expect(firstSelection.primaryRange).not.toBe(
      secondSelection.primaryRange
    );
    expect(firstSelection.additionalRanges).not.toBe(
      secondSelection.additionalRanges
    );
  });
});
