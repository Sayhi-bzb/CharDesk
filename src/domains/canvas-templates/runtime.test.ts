import { describe, expect, it } from "vitest";
import { getCanvasTemplateProjection } from "./runtime";

describe("Canvas template projection", () => {
  it("exposes one cached read-only cell source and declared viewport", () => {
    const projection = getCanvasTemplateProjection("badge");

    expect(getCanvasTemplateProjection("badge")).toBe(projection);
    expect(projection.viewport).toEqual({ x: 0, y: 0, width: 9, height: 1 });
    expect(projection.source.get({ x: 0, y: 0 })).toMatchObject({
      char: " ",
      bgColor: "#dcfcf3",
    });
    expect(projection.source.get({ x: 1, y: 0 })).toMatchObject({
      char: "",
      color: "#0d9488",
      bgColor: "#dcfcf3",
    });
    expect(projection.source.get({ x: 8, y: 0 })).toMatchObject({
      char: " ",
      bgColor: "#dcfcf3",
    });
  });
});
