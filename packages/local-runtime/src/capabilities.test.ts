import { afterEach, expect, it, vi } from "vitest";
import { FreeformEditorSession } from "@chardesk/editor-core/runtime";
import { localCapabilities } from "./capabilities";
import type { TerminalWorkspace } from "./workspace";
import type { LocalSessions } from "./sessions";

const models: FreeformEditorSession[] = [];
afterEach(() => models.splice(0).forEach((model) => model.dispose()));
const host = (persistentHistory = true) => {
  const model = new FreeformEditorSession();
  models.push(model);
  const file = { address: model.documents.getActiveAddress() };
  const workspace = {
    model,
    active: file,
    files: [file],
    saveFile: vi.fn(async () => {}),
    saveAll: vi.fn(async () => {}),
  };
  const tools = localCapabilities(
    workspace as unknown as TerminalWorkspace,
    { forFile: () => ({ id: "test" }) } as unknown as LocalSessions,
    persistentHistory,
  );
  return { model, workspace, execute: tools.execute };
};

it.each(["atomic", "code"])(
  "the local %s host forwards the shared undoable receipt",
  async (mode) => {
    const { model, execute, workspace } = host();
    await execute("canvas_write", {
      at: [-1, 2],
      content: "  ",
      style: { bgColor: "#123456", attrs: { underline: true } },
    });
    const before = model.plane.materialize();
    const result = await (mode === "atomic"
      ? execute("canvas_erase", { at: [-1, 2], size: [2, 1] })
      : execute("canvas_code", {
          mode: "apply",
          script: "return await canvas.erase({at:[-1,2],size:[2,1]});",
        }));
    expect(result).toMatchObject({
      changed: true,
      operationId: expect.any(String),
      persistence: "saved",
    });
    expect(
      mode === "atomic" ? result : (result as { result: unknown }).result,
    ).toMatchObject({ erasedCells: 2, impact: { clearedCells: 2 } });
    expect(model.plane.materialize().size).toBe(0);
    expect(
      await execute("canvas_undo", {
        operationId: (result as { operationId: string }).operationId,
      }),
    ).toMatchObject({ ok: true });
    expect(model.plane.materialize()).toEqual(before);
    expect(workspace.saveFile).toHaveBeenCalled();
  },
);

it("local no-ops and one-shot writes do not advertise unusable undo tokens", async () => {
  const { execute } = host();
  await execute("canvas_write", { at: [0, 0], content: "A" });
  for (const result of [
    await execute("canvas_write", { at: [0, 0], content: "A" }),
    await execute("canvas_erase", { at: [4, 4], size: [1, 1] }),
    await execute("canvas_code", {
      mode: "apply",
      script: "await canvas.erase({at:[4,4],size:[1,1]});",
    }),
  ]) {
    expect(result).toMatchObject({ changed: false });
    expect((result as { operationId?: string }).operationId).toBeUndefined();
  }
  const oneShot = host(false);
  const result = await oneShot.execute("canvas_write", {
    at: [0, 0],
    content: "A",
  });
  expect(result).toMatchObject({ changed: true, persistence: "saved" });
  expect((result as { operationId?: string }).operationId).toBeUndefined();
});

it("a one-shot Code save failure reports the applied mutation without an undo token", async () => {
  const { execute, workspace, model } = host(false);
  workspace.saveAll.mockRejectedValueOnce(new Error("disk failure"));
  const result = await execute("canvas_code", {
    mode: "apply",
    script: 'await canvas.write({at:[0,0],content:"A"});',
  });
  expect(result).toMatchObject({ changed: true, persistence: "failed" });
  expect((result as { operationId?: string }).operationId).toBeUndefined();
  expect(model.plane.get({ x: 0, y: 0 })?.char).toBe("A");
});
