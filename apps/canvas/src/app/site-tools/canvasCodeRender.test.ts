import { afterEach, describe, expect, it, vi } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { createCanvasRuntime, type CanvasRuntime } from "@/domains/canvas/public";
import { createTextRenderingRuntime } from "@/domains/document/public";
import { createCanvasCodeTool } from "./canvasCode";
import frameHelpers from "../../../../../.agents/skills/chardesk/assets/procedural-frame.js?raw";
import miniatureRaster from "../../../../../.agents/skills/chardesk/assets/miniature-raster.js?raw";
import cafeScene from "../../../../../.agents/skills/chardesk/assets/miniature-cafe.js?raw";
import { createCanvasManageTool, createCanvasReadTool, createCanvasRenderTool, createCanvasPreviewRenderTool, createCanvasSearchTool, createCanvasUndoTool, createCanvasWriteTool } from "./canvasTools";

describe("Code Mode material projection", () => {
  const canvases: CanvasRuntime[] = [];
  afterEach(() => canvases.splice(0).forEach(canvas => canvas.dispose()));

  const host = () => {
    const canvas = createCanvasRuntime({
      persistence: false,
      selectionCommands: createSelectionCommandFactory({ renderClipboardText: async () => ({ kind: "spans", renderer: "raw", pipeline: [], rows: [], width: 0, height: 0, diagnostics: [] }) }),
      parseSessionSource: async () => ({ mode: "freeform", grid: [] }),
      initialSessions: [{ id: "canvas-a", name: "A", mode: "freeform", grid: [] }],
    });
    canvases.push(canvas);
    const runtime = createTextRenderingRuntime({ storage: false });
    const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };
    const render = createCanvasRenderTool(canvas, rendering);
    const execute = vi.spyOn(render, "execute");
    const code = createCanvasCodeTool({
      read: createCanvasReadTool(canvas, rendering), search: createCanvasSearchTool(canvas),
      write: createCanvasWriteTool(canvas), manage: createCanvasManageTool(canvas),
      render, previewRender: createCanvasPreviewRenderTool(canvas, rendering),
      history: canvas.commands.history,
    });
    return {canvas,code,execute};
  };

  it("groups composed primitives under one operation and rolls back rejected scripts", async () => {
    const {canvas,code}=host();
    await canvas.ready;
    await createCanvasWriteTool(canvas).execute({at:[0,0],content:"OLD"});
    const script = `
      await canvas.render({at:[0,0],source:"X X",format:"raw",writeMode:"patch"});
      await canvas.write({at:[0,1],content:"NOTE"});
    `;
    const applied=await code.execute({mode:"apply",script});
    expect(applied).toMatchObject({writes:2,operationId:expect.any(String)});
    const reader=canvas.getState().contentSurface.reader;
    expect([0,1,2].map(x=>reader.getCell({x,y:0})?.char).join("")).toBe("XLX");
    expect(reader.getCell({x:0,y:1})?.char).toBe("N");
    expect(await createCanvasUndoTool(canvas).execute({operationId:(applied as {operationId:string}).operationId})).toMatchObject({undone:true});
    expect([0,1,2].map(x=>reader.getCell({x,y:0})?.char).join("")).toBe("OLD");
    expect(reader.getCell({x:0,y:1})).toBeUndefined();
    expect(await code.execute({mode:"apply",script:script+'throw new Error("stop");'})).toMatchObject({ok:false,message:"stop"});
    expect([0,1,2].map(x=>reader.getCell({x,y:0})?.char).join("")).toBe("OLD");
    expect(reader.getCell({x:0,y:1})).toBeUndefined();
    canvas.commands.history.undo();
    expect(reader.getContentBounds()).toBeNull();
  });

  it("previews and applies a large transparent frame in one render call and one undo", async () => {
    const {canvas,code,execute}=host();
    await canvas.ready;
    // Execute the actual skill case through QuickJS and the real Canvas renderer.
    const script = [frameHelpers, miniatureRaster, cafeScene, `
      const raster=createMiniatureRaster({width:220,height:180,scale:10,origin:[110,112]});
      const frame=drawMiniatureCafe(raster);
      const material=encodeHalfBlocks(frame);
      const result=await canvas.render({at:[0,0],source:material.source,format:material.format,writeMode:'patch'});
      return {writtenCells:result.writtenCells,skippedWhitespaceCells:result.skippedWhitespaceCells};
    `].join("\n");
    const preview = await code.execute({ script, timeoutMs: 10000 });
    expect(preview).toMatchObject({ result: { writtenCells: 6686, skippedWhitespaceCells: 13114 } });
    expect(execute).not.toHaveBeenCalled();
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();

    const applied = await code.execute({ script, mode: "apply", timeoutMs: 10000 });
    expect(applied).toMatchObject({ result: { writtenCells: 6686, skippedWhitespaceCells: 13114 }, writes: 1, operationId: expect.any(String) });
    expect(execute).toHaveBeenCalledOnce();
    const reader = canvas.getState().contentSurface.reader;
    expect(reader.materialize().size).toBe(6686);
    expect(reader.getCell({ x: 0, y: 0 })).toBeUndefined();
    expect(reader.getCell({ x: 91, y: 10 })).toMatchObject({ char: "▀", color: "#c88a70", bgColor: "#bf7961" });
    expect(reader.getCell({ x: 104, y: 9 })).toMatchObject({ char: "▄", color: "#eccfac" });
    expect(reader.getCell({ x: 104, y: 9 })?.bgColor).toBeUndefined();
    expect(reader.getCell({ x: 75, y: 23 })).toMatchObject({ char: "▀", color: "#a86b57" });
    expect(reader.getCell({ x: 75, y: 23 })?.bgColor).toBeUndefined();

    const operationId = (applied as { operationId: string }).operationId;
    expect(await createCanvasUndoTool(canvas).execute({ operationId })).toMatchObject({ undone: true });
    expect(reader.getContentBounds()).toBeNull();
    expect(canvas.getState().canUndo).toBe(false);
  }, 20000);
});
