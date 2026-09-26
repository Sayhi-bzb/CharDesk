import { describe, expect, it } from "vitest";
import { useEditorStore } from "@/domains/canvas/testing";

describe("editor store defaults", () => {
  it("starts with the canvas grid hidden", () => {
    expect(useEditorStore.getState().showGrid).toBe(false);
  });
});
