import { afterEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import {
  createCanvasRuntime,
  type CanvasRuntime,
} from "@/domains/canvas/public";
import { createTextRenderingRuntime } from "@/domains/document/public";
import { createCanvasCodeTool } from "./canvasCode";
import {
  createCanvasEraseTool,
  createCanvasFillTool,
  createCanvasManageTool,
  createCanvasReadTool,
  createCanvasSearchTool,
  createCanvasUndoTool,
  createCanvasWriteTool,
} from "./canvasTools";

describe("Canvas mutation receipts", () => {
  const hosts: CanvasRuntime[] = [];
  afterEach(() => hosts.splice(0).forEach((c) => c.dispose()));
  const host = async () => {
    const canvas = createCanvasRuntime({
      persistence: false,
      selectionCommands: createSelectionCommandFactory({
        renderClipboardText: async () => ({
          kind: "spans",
          renderer: "raw",
          pipeline: [],
          rows: [],
          width: 0,
          height: 0,
          diagnostics: [],
        }),
      }),
      parseSessionSource: async () => ({ mode: "freeform", grid: [] }),
      initialSessions: [
        { id: "canvas-a", name: "A", mode: "freeform", grid: [] },
      ],
    });
    hosts.push(canvas);
    await canvas.ready;
    const rendering = createTextRenderingRuntime({ storage: false });
    const write = createCanvasWriteTool(canvas),
      erase = createCanvasEraseTool(canvas),
      undo = createCanvasUndoTool(canvas);
    const code = createCanvasCodeTool({
      read: createCanvasReadTool(canvas, {
        render: rendering.renderCompact,
        getProfile: rendering.getProfile,
        getContext: () => ({ themeMode: "light" }),
      }),
      search: createCanvasSearchTool(canvas),
      write,
      erase,
      manage: createCanvasManageTool(canvas),
      history: canvas.commands.history,
    });
    return {
      canvas,
      write,
      erase,
      undo,
      code,
      reader: canvas.getState().contentSurface.reader,
    };
  };

  it.each(["atomic", "code"])(
    "returns an undoable receipt for styled-space deletion through %s",
    async (mode) => {
      const { canvas, write, erase, undo, code, reader } = await host();
      await write.execute({
        at: [-2, 3],
        content: " ",
        style: {
          bgColor: "#123456",
          href: "https://example.com",
          attrs: { underline: true },
        },
      });
      await write.execute({
        at: [-1, 3],
        content: " ",
        style: { bgColor: "#654321", attrs: { italic: true } },
      });
      const before = reader.materialize();
      const result = await (mode === "atomic"
        ? erase.execute({ at: [-2, 3], size: [2, 1] })
        : code.execute({
            mode: "apply",
            script: "return await canvas.erase({at:[-2,3],size:[2,1]});",
          }));
      expect(result).toMatchObject({
        changed: true,
        operationId: expect.any(String),
      });
      expect(
        mode === "atomic" ? result : (result as { result: unknown }).result,
      ).toMatchObject({
        erasedCells: 2,
        impact: { clearedCells: 2, clearedBounds: [-2, 3, 2, 1] },
      });
      expect(reader.materialize().size).toBe(0);
      expect(
        await undo.execute({
          operationId: (result as { operationId: string }).operationId,
        }),
      ).toMatchObject({ undone: true });
      expect(reader.materialize()).toEqual(before);
      expect(canvas.getState().canRedo).toBe(true);
    },
  );

  it("does not mint undo tokens for empty erases, including Code Mode", async () => {
    const { write, erase, undo, code, reader } = await host();
    const seed = (await write.execute({ at: [0, 0], content: "A" })) as {
      operationId: string;
    };
    for (const result of [
      await erase.execute({ at: [99, 99], size: [2, 1] }),
      await code.execute({
        mode: "apply",
        script: "await canvas.erase({at:[99,99],size:[2,1]});",
      }),
    ]) {
      expect(result).toMatchObject({ changed: false });
      expect(result).not.toHaveProperty("operationId");
    }
    expect(await undo.execute({ operationId: seed.operationId })).toMatchObject(
      { undone: true },
    );
    expect(reader.materialize().size).toBe(0);
  });

  it("distinguishes touched counts from an unchanged projection", async () => {
    const { canvas, write, undo } = await host();
    const seed = (await write.execute({
      at: [0, 0],
      content: "A",
      style: { color: "red" },
    })) as { operationId: string };
    for (const result of [
      await write.execute({
        at: [0, 0],
        content: "A",
        style: { color: "red" },
      }),
      await createCanvasFillTool(canvas).execute({
        at: [0, 0],
        size: [1, 1],
        style: { color: "red" },
      }),
      await write.execute({ at: [0, 0], content: " " }),
    ]) {
      expect(result).toMatchObject({ changed: false });
      expect(result).not.toHaveProperty("operationId");
    }
    expect(await undo.execute({ operationId: seed.operationId })).toMatchObject(
      { undone: true },
    );
  });

  it.each([-33, -1, 31])(
    "reports the actual wide-glyph footprint at %s",
    async (x) => {
      const { write, erase, undo, reader } = await host();
      await write.execute({
        at: [x, -4],
        content: "界!",
        style: { bgColor: "blue" },
      });
      const before = reader.materialize();
      const result = await erase.execute({ at: [x + 1, -4], size: [1, 1] });
      expect(result).toMatchObject({
        changed: true,
        erasedCells: 1,
        bounds: [x, -4, 2, 1],
        impact: { clearedBounds: [x, -4, 2, 1] },
      });
      expect(reader.get({ x: x + 2, y: -4 })?.char).toBe("!");
      expect(
        await undo.execute({
          operationId: (result as { operationId: string }).operationId,
        }),
      ).toMatchObject({ undone: true });
      expect(reader.materialize()).toEqual(before);
    },
  );

  it("rolls back a failed composed erase, including all background attributes", async () => {
    const { write, code, reader } = await host();
    await write.execute({
      at: [0, 0],
      content: " ",
      style: { bgColor: "blue", attrs: { underline: true } },
    });
    const before = reader.materialize();
    expect(
      await code.execute({
        mode: "apply",
        script:
          'await canvas.erase({at:[0,0],size:[1,1]}); throw new Error("cancel");',
      }),
    ).toMatchObject({ ok: false });
    expect(reader.materialize()).toEqual(before);
  });
});
