import { afterEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { createCanvasRuntime, type CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool } from "./canvasTools";

describe("Canvas writing tool", () => {
  const runtimes: CanvasRuntime[] = [];
  afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.dispose()));
  const host = () => {
    const canvas = createCanvasRuntime({
      persistence: false,
      selectionCommands: createSelectionCommandFactory({ renderClipboardText: async () => ({ kind: "spans", renderer: "raw", pipeline: [], rows: [], width: 0, height: 0, diagnostics: [] }) }),
      parseSessionSource: async () => ({ mode: "freeform", grid: [] }),
      initialSessions: [{ id: "canvas-a", name: "A", mode: "freeform", grid: [] }],
    });
    runtimes.push(canvas);
    return canvas;
  };

  it("writes graphemes at signed coordinates without changing interaction and undoes each call separately", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas);
    const interaction = canvas.getState().interaction;
    const camera = canvas.viewport.getSnapshot();
    expect(tool.readOnly).toBe(false);
    expect(await tool.execute({ at: [-5, -2], content: "你é\nABCD" })).toEqual({ canvasId: "canvas-a", bounds: [-5, -2, 4, 2] });
    expect(await tool.execute({ at: [-5, -1], content: "X " })).toEqual({ canvasId: "canvas-a", bounds: [-5, -1, 2, 1] });
    const view = await createCanvasReadTool(canvas).execute({ viewport: [-5, -2, 4, 2] });
    expect(view).toMatchObject({ content: expect.stringContaining("你é ") });
    expect(view).toMatchObject({ content: expect.stringContaining("X CD") });
    expect(canvas.getState().interaction).toEqual(interaction);
    expect(canvas.viewport.getSnapshot()).toEqual(camera);
    canvas.commands.history.undo();
    expect(canvas.getState().contentSurface.reader.getCell({ x: -5, y: -1 })?.char).toBe("A");
    canvas.commands.history.undo();
    expect(canvas.getState().contentSurface.reader.getCell({ x: -5, y: -2 })).toBeUndefined();
    canvas.commands.history.redo();
    expect(canvas.getState().contentSurface.reader.getCell({ x: -5, y: -2 })?.char).toBe("你");
  });

  it("validates the whole write before modifying content and treats empty text as a no-op", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas);
    for (const input of [{ at: [0], content: "A" }, { at: [0, 0], content: "A\n\tB" },
      { at: [Number.MAX_SAFE_INTEGER, 0], content: "AB" }, { at: [0, 0], content: "A", viewport: [0, 0, 1, 1] }]) {
      expect(await tool.execute(input)).toMatchObject({ code: "invalid_input" });
    }
    expect(await tool.execute({ at: [0, 0], content: "\n" })).toEqual({ canvasId: "canvas-a", bounds: null });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
  });

  it("rejects source projections and Slide overflow instead of silently clipping", async () => {
    const canvas = host();
    canvas.commands.sessions.openSource({ kind: "blackboard", provider: "browser-workspace", id: "source-a" });
    expect(await createCanvasWriteTool(canvas).execute({ at: [0, 0], content: "A" })).toMatchObject({ code: "source_backed_canvas" });
    canvas.commands.sessions.create("slide");
    expect(await createCanvasWriteTool(canvas).execute({ at: [-1, 0], content: "A" })).toMatchObject({ code: "out_of_bounds" });
    expect(await createCanvasWriteTool(canvas).execute({ at: [0, 0], content: "A" })).toMatchObject({ bounds: [0, 0, 1, 1] });
  });

  it("preserves empty rows and reports only the envelope of written positions", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas);
    await tool.execute({ at: [0, 0], content: "ABCD\nEFGH\nIJKL" });
    expect(await tool.execute({ at: [0, 0], content: "\r\n你\r\n\r\nZ" })).toEqual({ canvasId: "canvas-a", bounds: [0, 1, 2, 3] });
    const reader = canvas.getState().contentSurface.reader;
    expect(reader.getCell({ x: 0, y: 0 })?.char).toBe("A");
    expect(reader.getCell({ x: 2, y: 1 })?.char).toBe("G");
    expect(reader.getCell({ x: 0, y: 2 })?.char).toBe("I");
    await tool.execute({ at: [1, 1], content: "X" });
    expect(reader.getCell({ x: 0, y: 1 })).toBeUndefined();
    expect(reader.getCell({ x: 1, y: 1 })?.char).toBe("X");
  });
});
