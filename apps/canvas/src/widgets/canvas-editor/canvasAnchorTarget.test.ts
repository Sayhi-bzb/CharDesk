import { describe, expect, it } from "vitest";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { createGridSelectionState, selectGridRange } from "@/domains/selection/public";
import { resolveCanvasAnchorTarget } from "./canvasAnchorTarget";

const cell = (char: string) => ({ char, color: "#000000" });

describe("Canvas anchor creation target", () => {
  const source = createGridSurfaceReader(new Map([
    ["0,0", cell("#")], ["1,0", cell(" ")], ["2,0", cell("中")],
    ["4,0", cell("A")], ["0,1", cell("🧠")], ["2,1", cell("B")],
  ]));

  it("uses selected text verbatim and anchors its first occupied cell", () => {
    const selection = selectGridRange(createGridSelectionState(), {
      start: { x: 0, y: 0 }, end: { x: 4, y: 1 },
    });
    expect(resolveCanvasAnchorTarget(source, selection)).toEqual({
      point: { x: 0, y: 0 }, label: "# 中A 🧠B",
    });
    expect(resolveCanvasAnchorTarget(source, selection, { x: 3, y: 0 })).toEqual({
      point: { x: 0, y: 0 }, label: "# 中A 🧠B",
    });
  });

  it("uses the clicked text when the click is outside the range or on a wide follower", () => {
    const selection = selectGridRange(createGridSelectionState(), {
      start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    });
    expect(resolveCanvasAnchorTarget(source, selection, { x: 3, y: 0 })).toEqual({
      point: { x: 2, y: 0 }, label: "中A",
    });
    expect(resolveCanvasAnchorTarget(source, selection, { x: 1, y: 1 })).toEqual({
      point: { x: 0, y: 1 }, label: "🧠B",
    });
  });

  it("rejects a range containing no text", () => {
    const selection = selectGridRange(createGridSelectionState(), {
      start: { x: 10, y: 0 }, end: { x: 15, y: 0 },
    });
    expect(resolveCanvasAnchorTarget(source, selection)).toBeNull();
  });
});
