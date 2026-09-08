import { describe, expect, it } from "vitest";
import { getGridSelectionGeometry } from "@/domains/selection/public";
import { resolveCanvasCellPresentation } from "./canvasCellPresentation";

const geometry = getGridSelectionGeometry([
  { start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
]);

const resolve = (overrides: Partial<Parameters<typeof resolveCanvasCellPresentation>[0]> = {}) =>
  resolveCanvasCellPresentation({
    viewActive: true,
    inputFocused: true,
    editMode: "navigate",
    activeCell: { x: 1, y: 2 },
    textCursor: null,
    hasRangeSelection: false,
    selectionGeometry: geometry,
    cursorPreference: { shape: "block", blink: true },
    ...overrides,
  });

describe("Canvas Cell presentation", () => {
  it("uses one configured Cursor for navigate and text edit", () => {
    expect(resolve()).toEqual({
      selectionGeometry: null,
      cursor: {
        point: { x: 1, y: 2 },
        shape: "block",
        blink: false,
      },
    });
    expect(resolve({
      editMode: "text-edit",
      textCursor: { x: 4, y: 5 },
      cursorPreference: { shape: "underline", blink: true },
    }).cursor).toEqual({
      point: { x: 4, y: 5 },
      shape: "underline",
      blink: true,
    });
  });

  it("keeps an unfocused active view visible but stops blinking", () => {
    expect(resolve({
      inputFocused: false,
      editMode: "text-edit",
      textCursor: { x: 2, y: 3 },
    }).cursor).toMatchObject({ blink: false });
  });

  it("lets Range and inactive-view state take precedence", () => {
    expect(resolve({ hasRangeSelection: true })).toEqual({
      selectionGeometry: geometry,
      cursor: null,
    });
    expect(resolve({ viewActive: false })).toEqual({
      selectionGeometry: null,
      cursor: null,
    });
  });
});
