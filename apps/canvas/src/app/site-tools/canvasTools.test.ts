import { describe, expect, it, vi } from "vitest";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { createCanvasReadTool } from "./canvasTools";

const host = (id: string | null = "canvas-a") => ({
  ready: Promise.resolve(),
  getState: () => ({ activeCanvasId: id }) as ReturnType<CanvasRuntime["getState"]>,
  materializeSession: vi.fn(async (canvasId: string) => ({ id: canvasId, name: "Example", mode: "freeform" as const,
    surface: createGridSurfaceReader(new Map([["0,0", { char: "A", color: "#000" }]])), slideDeck: null })),
});

describe("Canvas reading tool", () => {
  it("captures the target session and reads it without switching it", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas);
    expect(tool.readOnly).toBe(true);
    expect(await tool.execute({ viewport: [0, 0, 4, 2] })).toMatchObject({ canvasId: "canvas-a", viewport: [0, 0, 4, 2], mode: "text" });
    expect(canvas.materializeSession).toHaveBeenCalledWith("canvas-a");
  });

  it("returns actionable errors for invalid input and missing sessions", async () => {
    const tool = createCanvasReadTool(host(null));
    expect(await tool.execute({})).toMatchObject({ code: "canvas_not_active" });
    expect(await tool.execute({ viewport: [0, 0, -1, 1] })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ scale: 2 })).toMatchObject({ code: "invalid_input" });
    const canvas = host();
    canvas.materializeSession.mockResolvedValue(null as never);
    expect(await createCanvasReadTool(canvas).execute({})).toMatchObject({ code: "canvas_not_ready" });
  });

  it("follows the active session on each call", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas);
    expect(await tool.execute({})).toMatchObject({ canvasId: "canvas-a" });
    vi.spyOn(canvas, "getState").mockReturnValue({ ...canvas.getState(), activeCanvasId: "canvas-b" });
    expect(await tool.execute({})).toMatchObject({ canvasId: "canvas-b" });
    expect(canvas.materializeSession).toHaveBeenLastCalledWith("canvas-b");
  });
});
