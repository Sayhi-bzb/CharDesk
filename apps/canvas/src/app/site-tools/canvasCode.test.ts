import { describe, expect, it, vi } from "vitest";
import { createCanvasCodeTool } from "./canvasCode";

const tool = (execute: (input: Record<string, unknown>) => unknown, name = "tool") => ({
  name, description: name, inputSchema: { type: "object" }, execute,
});

describe("Canvas code tool", () => {
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
      await canvas.write({ at: [1, 2], content: view.content, writeMode: "patch" });
      return { seen: view.content, ok: true };
    ` });
    expect(result).toMatchObject({ mode: "apply", result: { seen: "A", ok: true }, writes: 1 });
    expect(read).toHaveBeenCalledWith({ viewport: [0, 0, 1, 1] });
    expect(write).toHaveBeenCalledWith({ at: [1, 2], content: "A", writeMode: "patch" });
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
});
