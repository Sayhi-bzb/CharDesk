import { describe, expect, it, vi } from "vitest";
import { createCanvasCodeTool } from "./canvasCode";

const tool = (execute: (input: Record<string, unknown>) => unknown, name = "tool") => ({
  name, description: name, inputSchema: { type: "object" }, execute,
});

describe("Canvas code tool", () => {
  it.each(["patch", "replace"])("forwards render writeMode=%s in preview and apply", async (writeMode) => {
    const render = vi.fn(async () => ({ writtenCells: 2 }));
    const previewRender = vi.fn(async () => ({ writtenCells: 2, preview: true }));
    const code = createCanvasCodeTool({
      read: tool(async () => ({})), search: tool(async () => ({})),
      write: tool(async () => ({})), manage: tool(async () => ({})),
      render: tool(render), previewRender: tool(previewRender),
    });
    const script = `return await canvas.render({at:[0,0],source:" X ",format:"ansi",writeMode:"${writeMode}"});`;
    expect(await code.execute({ script, canvasId: "cv-a" })).toMatchObject({ result: { preview: true } });
    expect(render).not.toHaveBeenCalled();
    expect(await code.execute({ script, canvasId: "cv-a", mode: "apply" })).toMatchObject({ result: { writtenCells: 2 } });
    const expected = { at: [0,0], source: " X ", format: "ansi", writeMode, canvasId: "cv-a" };
    expect(previewRender).toHaveBeenCalledWith(expected);
    expect(render).toHaveBeenCalledWith(expected);
  });
  it("runs a pure script", async () => {
    const code = createCanvasCodeTool({ read: tool(async () => ({})), search: tool(async () => ({})), write: tool(async () => ({})), manage: tool(async () => ({})) });
    expect(await code.execute({ script: `return 1 + 1;` })).toMatchObject({ result: 2 });
  });
  it("composes capabilities inside the isolated runtime", async () => {
    const read = vi.fn(async () => ({ content: "A" }));
    const write = vi.fn(async (input: Record<string, unknown>) => ({ bounds: input.at, writtenCells: 1 }));
    const code = createCanvasCodeTool({
      read: tool(read, "read"), search: tool(async () => ({ matches: [] }), "search"),
      write: tool(write, "write"), manage: tool(async () => ({ canvases: [] }), "manage"),
    });
    const result = await code.execute({ mode: "apply", script: `
      const view = await canvas.read({ viewport: [0, 0, 1, 1] });
      await canvas.write({ at: [1, 2], content: view.content, style: { color: "red" } });
      return { seen: view.content, ok: true };
    ` });
    expect(result).toMatchObject({ mode: "apply", result: { seen: "A", ok: true }, writes: 1 });
    expect(read).toHaveBeenCalledWith({ viewport: [0, 0, 1, 1] });
    expect(write).toHaveBeenCalledWith({ at: [1, 2], content: "A", style: { color: "red" } });
  });

  it("keeps preview writes out of the host and commits apply as one checkpoint", async () => {
    const write = vi.fn(async () => ({ writtenCells: 1 }));
    const previewWrite = vi.fn(async (input: Record<string, unknown>) => ({
      preview: true,
      bounds: input.at,
      rendered: { kind: "plain", text: input.content },
    }));
    const commit = vi.fn();
    const cancel = vi.fn();
    const code = createCanvasCodeTool({
      read: tool(async () => ({})), search: tool(async () => ({})), write: tool(write), manage: tool(async () => ({})),
      previewWrite: tool(previewWrite, "previewWrite"),
      history: { beginCheckpoint: () => ({ commit, cancel }) },
    });
    expect(await code.execute({ script: `return await canvas.write({ at: [0, 0], content: "X" });` })).toMatchObject({ mode: "preview", result: { preview: true, bounds: [0, 0] }, writes: 1 });
    expect(write).not.toHaveBeenCalled();
    expect(previewWrite).toHaveBeenCalledWith({ at: [0, 0], content: "X" });
    expect(await code.execute({ mode: "apply", script: `await canvas.write({ at: [0, 0], content: "X" }); return "done";` })).toMatchObject({ mode: "apply", result: "done" });
    expect(write).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("rolls back the checkpoint when a script fails", async () => {
    const cancel = vi.fn();
    const code = createCanvasCodeTool({
      read: tool(async () => ({})), search: tool(async () => ({})), write: tool(async () => ({})), manage: tool(async () => ({})),
      history: { beginCheckpoint: () => ({ commit: vi.fn(), cancel }) },
    });
    expect(await code.execute({ mode: "apply", script: `throw new Error("nope")` })).toMatchObject({ ok: false, code: "execution_failed" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("returns an operation token and undoes only that latest apply", async () => {
    const undoOperation = vi.fn(() => true);
    const beginCheckpoint = vi.fn(() => ({ commit: vi.fn(), cancel: vi.fn() }));
    const code = createCanvasCodeTool({
      read: tool(async () => ({})), search: tool(async () => ({})),
      write: tool(async () => ({ writtenCells: 1 })), manage: tool(async () => ({})),
      history: { beginCheckpoint, undoOperation },
    });
    const applied = await code.execute({ mode: "apply", script: `await canvas.write({ at: [0, 0], content: "X" });` });
    expect(applied).toMatchObject({ mode: "apply", operationId: expect.stringMatching(/^op-[0-9a-f]{12}$/), writes: 1 });
    const operationId = (applied as { operationId: string }).operationId;
    expect(beginCheckpoint).toHaveBeenCalledWith(operationId, undefined);
    const undone = await code.execute({ mode: "apply", script: `return await canvas.undo({ operationId: "${operationId}" });` });
    expect(undone).toMatchObject({ mode: "apply", result: { undone: true, operationId } });
    expect(undoOperation).toHaveBeenCalledWith(operationId);
  });

  it("rejects a second Canvas inside one apply", async () => {
    const write = vi.fn(async () => ({ writtenCells: 1 }));
    const cancel = vi.fn();
    const code = createCanvasCodeTool({
      read: tool(async () => ({})), search: tool(async () => ({})), write: tool(write), manage: tool(async () => ({})),
      history: { beginCheckpoint: () => ({ commit: vi.fn(), cancel }) },
    });
    expect(await code.execute({ mode: "apply", canvasId: "cv-a", script: `await canvas.write({ canvasId: "cv-b", at: [0, 0], content: "X" });` })).toMatchObject({ ok: false, code: "execution_failed" });
    expect(write).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("drains unawaited host calls and their JS continuations before committing", async () => {
    const events: string[] = [];
    const code = createCanvasCodeTool({
      read: tool(async () => { await new Promise(resolve => setTimeout(resolve, 10)); return { content: "X" }; }),
      search: tool(async () => ({})), manage: tool(async () => ({})),
      write: tool(async () => { await new Promise(resolve => setTimeout(resolve, 10)); events.push("write"); return { persistence: "saved" }; }),
      history: { beginCheckpoint: () => ({commit: () => events.push("commit"), cancel: vi.fn()}) },
    });
    const result = await code.execute({mode: "apply", script: `canvas.read({}).then(x => canvas.write({at:[0,0],content:x.content})); return "done";`});
    expect(events).toEqual(["write", "commit"]);
    expect(result).toMatchObject({result: "done", persistence: "saved", writes: 1});
  });

  it("settles writes before cancelling a rejected script", async () => {
    const events: string[] = [];
    const code = createCanvasCodeTool({read: tool(async () => ({})), search: tool(async () => ({})), manage: tool(async () => ({})),
      write: tool(async () => { await new Promise(resolve => setTimeout(resolve, 10)); events.push("write"); return {}; }),
      history: {beginCheckpoint: () => ({commit: vi.fn(), cancel: () => events.push("cancel")})},
    });
    expect(await code.execute({mode:"apply",script:`canvas.write({at:[0,0],content:"X"}); throw new Error("stop");`})).toMatchObject({ok:false,message:"stop"});
    expect(events).toEqual(["write","cancel"]);
  });

  it("keeps caught host failures recoverable in JavaScript", async () => {
    const code = createCanvasCodeTool({read: tool(async () => {throw new Error("unavailable");}), search: tool(async () => ({})), manage: tool(async () => ({})), write: tool(async () => ({}))});
    expect(await code.execute({script:`try { await canvas.read({}); } catch(e) { return e.message; }`})).toMatchObject({result:"unavailable"});
  });

  it("quarantines callbacks that arrive after timeout", async () => {
    let finish: (value: unknown) => void = () => {};
    const late = new Promise(resolve => {finish=resolve;});
    const code = createCanvasCodeTool({read:tool(async()=>({})),search:tool(async()=>({})),manage:tool(async()=>({})),write:tool(async()=>late)});
    expect(await code.execute({mode:"apply",timeoutMs:50,script:`canvas.write({at:[0,0],content:"X"});`})).toMatchObject({ok:false,executionUnknown:true,pendingHostCalls:1});
    finish({persistence:"saved"});
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  it("tracks render-only edits for history and drains preview renders", async () => {
    const render = tool(async () => {await new Promise(resolve => setTimeout(resolve,10));return {persistence:"saved"};});
    const commit=vi.fn();
    const code=createCanvasCodeTool({read:tool(async()=>({})),search:tool(async()=>({})),manage:tool(async()=>({})),write:tool(async()=>({})),render,previewRender:render,history:{beginCheckpoint:()=>({commit,cancel:vi.fn()})}});
    expect(await code.execute({mode:"apply",script:`canvas.render({at:[0,0],source:"X",format:"raw"});`})).toMatchObject({writes:1,persistence:"saved",operationId:expect.any(String)});
    expect(commit).toHaveBeenCalledOnce();
    expect(await code.execute({script:`canvas.render({at:[0,0],source:"X",format:"raw"});`})).toMatchObject({writes:1});
  });

  it("reports script errors in user coordinates and identifies exact executed bytes", async () => {
    const code = createCanvasCodeTool({read:tool(async()=>({})),search:tool(async()=>({})),manage:tool(async()=>({})),write:tool(async()=>({}))});
    const failed = await code.execute({script:'const value = 1;\nthrow new RangeError("rgb");'});
    expect(failed).toMatchObject({ok:false,phase:"evaluate",mutationState:"none",error:{name:"RangeError",message:"rgb",frames:[{line:2}]},scriptHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
    const success = await code.execute({script:'return 1;'});
    const changed = await code.execute({script:'return 2;'});
    const repeated = await code.execute({script:'return 1;'});
    expect(success).toMatchObject({scriptHash:(repeated as {scriptHash:string}).scriptHash});
    expect((success as {scriptHash:string}).scriptHash).not.toBe((changed as {scriptHash:string}).scriptHash);
  });

  it("preserves syntax diagnostics and marks dispatched writes for inspection", async () => {
    const code = createCanvasCodeTool({read:tool(async()=>({})),search:tool(async()=>({})),manage:tool(async()=>({})),write:tool(async()=>({writtenCells:1}))});
    expect(await code.execute({script:'const = ;'})).toMatchObject({ok:false,error:{name:"SyntaxError",frames:[{line:1}]}});
    expect(await code.execute({mode:"apply",script:'await canvas.write({at:[0,0],content:"X"}); throw new Error("after write");'})).toMatchObject({ok:false,writes:1,mutationState:"inspect"});
    expect(await code.execute({script:'await canvas.read({}); throw "literal";'})).toMatchObject({ok:false,error:{name:"ThrownValue",message:"literal"}});
  });

  it("does not expose host paths when a capability rejects", async () => {
    const code = createCanvasCodeTool({read:tool(async()=>{throw new TypeError("host failure");}),search:tool(async()=>({})),manage:tool(async()=>({})),write:tool(async()=>({}))});
    const result=await code.execute({script:'await canvas.read({});'});
    expect(result).toMatchObject({ok:false,phase:"capability",error:{name:"TypeError",message:"host failure"}});
    expect(JSON.stringify(result)).not.toContain("canvasCode.test.ts");
  });

});
