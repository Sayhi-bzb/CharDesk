import { afterEach, describe, expect, it } from "vitest";

import { canvasCommands, undoCanvas, setCanvasTestState, useEditorStore } from "@/domains/canvas/testing";
import type { StructuredNode } from "@/domains/structured-content/public";

const initialScene: StructuredNode[] = [
  {
    id: "text-1",
    type: "text",
    order: 1,
    position: { x: 1, y: 2 },
    text: "mixed",
    style: { color: "#111111" },
    styleRanges: [
      { start: 0, end: 2, style: { color: "#222222", bgColor: "#eeeeee" } },
    ],
  },
  {
    id: "bg-1",
    type: "bg",
    order: 2,
    start: { x: 0, y: 0 },
    end: { x: 8, y: 4 },
    style: { color: "#000000", bgColor: "#ffffff" },
  },
];

const reset = () => {
  setCanvasTestState({ canvasMode: "structured" });
  canvasCommands.structured.applyScene([], "reset");
  setCanvasTestState({
    canvasMode: "freeform",
    selectedStructuredNodeIds: [],
    structuredTextSelection: null,
  });
};

describe("structured selection style command", () => {
  afterEach(reset);

  it("updates each selected node's semantic primary color in one undo step", () => {
    setCanvasTestState({ canvasMode: "structured" });
    canvasCommands.structured.applyScene(initialScene, "reset");
    setCanvasTestState({
      selectedStructuredNodeIds: ["text-1", "bg-1"],
    });

    canvasCommands.structured.setSelectionPrimaryColor("#ff0000");

    const [text, bg] = useEditorStore.getState().structuredScene;
    expect(text.style).toMatchObject({ color: "#ff0000" });
    expect(text.type === "text" ? text.styleRanges : undefined).toEqual([
      {
        start: 0,
        end: 2,
        style: { color: "#ff0000", bgColor: "#eeeeee" },
      },
    ]);
    expect(bg.style).toMatchObject({ color: "#000000", bgColor: "#ff0000" });

    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene).toEqual(initialScene);
  });

  it("updates every selected node in one undoable scene change", () => {
    setCanvasTestState({ canvasMode: "structured" });
    canvasCommands.structured.applyScene(initialScene, "reset");
    setCanvasTestState({
      canvasMode: "structured",
      selectedStructuredNodeIds: ["text-1", "bg-1"],
    });

    canvasCommands.structured.setSelectionStyle({
      color: "#ff0000",
      bgColor: "#00ff00",
    });

    const [text, bg] = useEditorStore.getState().structuredScene;
    expect(text.style).toMatchObject({ color: "#ff0000", bgColor: "#00ff00" });
    expect(text.type === "text" ? text.styleRanges : undefined).toEqual([
      {
        start: 0,
        end: 2,
        style: { color: "#ff0000", bgColor: "#00ff00" },
      },
    ]);
    expect(bg.style).toMatchObject({ color: "#000000", bgColor: "#00ff00" });

    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene).toEqual(initialScene);
  });
});
