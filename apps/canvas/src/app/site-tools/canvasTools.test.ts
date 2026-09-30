import { describe, expect, it, vi } from "vitest";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasSearchTool } from "./canvasTools";
import { createTextRenderingRuntime } from "@/domains/document/public";

const runtime = createTextRenderingRuntime();
const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };

const host = (id: string | null = "canvas-a") => ({
  ready: Promise.resolve(),
  getState: () => ({ activeCanvasId: id }) as ReturnType<CanvasRuntime["getState"]>,
  materializeSession: vi.fn(async (canvasId: string) => ({ id: canvasId, name: "Example", mode: "freeform" as const,
    surface: createGridSurfaceReader(new Map([["0,0", { char: "A", color: "#000" }]])), slideDeck: null })),
});

describe("Canvas searching tool", () => {
  it("captures the session, returns Cell bounds, and is read-only", async () => {
    const canvas = host();
    const tool = createCanvasSearchTool(canvas);
    expect(tool.readOnly).toBe(true);
    expect(await tool.execute({ query: "A" })).toEqual({ canvasId: "canvas-a", matches: [{ bounds: [0, 0, 1, 1], text: "A" }], next: null });
    expect(canvas.materializeSession).toHaveBeenCalledWith("canvas-a");
    expect(await tool.execute({ query: "A", viewport: [1, 0, 10, 1] })).toMatchObject({ matches: [] });
    expect(await tool.execute({ query: "A", after: [0, 0] })).toMatchObject({ matches: [] });
  });

  it("validates arguments before reading and handles unavailable content", async () => {
    const canvas = host();
    const tool = createCanvasSearchTool(canvas);
    for (const input of [{}, { query: " " }, { query: "A\nB" }, { query: "A", regex: true },
      { query: "A", after: [0] }, { query: "A", viewport: [0, 0, 0, 1] }]) {
      expect(await tool.execute(input)).toMatchObject({ code: "invalid_input" });
    }
    expect(canvas.materializeSession).not.toHaveBeenCalled();
    expect(await createCanvasSearchTool(host(null)).execute({ query: "A" })).toMatchObject({ code: "canvas_not_active" });
    canvas.materializeSession.mockResolvedValue(null as never);
    expect(await tool.execute({ query: "A" })).toMatchObject({ code: "canvas_not_ready" });
  });

  it("does not retarget an in-flight search when the active session changes", async () => {
    const canvas = host();
    canvas.materializeSession.mockImplementationOnce(async (id) => {
      vi.spyOn(canvas, "getState").mockReturnValue({ ...canvas.getState(), activeCanvasId: "canvas-b" });
      return { id, name: "Example", mode: "freeform", surface: createGridSurfaceReader(new Map([["0,0", { char: "A", color: "#000" }]])), slideDeck: null };
    });
    expect(await createCanvasSearchTool(canvas).execute({ query: "A" })).toMatchObject({ canvasId: "canvas-a", matches: [{ bounds: [0, 0, 1, 1] }] });
  });
});

describe("Canvas reading tool", () => {
  it("captures the target session and reads it without switching it", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas, rendering);
    expect(tool.readOnly).toBe(true);
    expect(await tool.execute({ viewport: [0, 0, 4, 2] })).toMatchObject({ canvasId: "canvas-a", viewport: [0, 0, 4, 2], mode: "text" });
    expect(canvas.materializeSession).toHaveBeenCalledWith("canvas-a");
    expect(await tool.execute({ viewport: [0, 0, 4, 2] })).toMatchObject({
      content: expect.stringContaining("y=0 x=0{fg:#000}"),
    });
  });

  it("returns actionable errors for invalid input and missing sessions", async () => {
    const tool = createCanvasReadTool(host(null), rendering);
    expect(await tool.execute({})).toMatchObject({ code: "canvas_not_active" });
    expect(await tool.execute({ viewport: [0, 0, -1, 1] })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ scale: 2 })).toMatchObject({ code: "invalid_input" });
    const canvas = host();
    canvas.materializeSession.mockResolvedValue(null as never);
    expect(await createCanvasReadTool(canvas, rendering).execute({})).toMatchObject({ code: "canvas_not_ready" });
  });

  it("follows the active session on each call", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas, rendering);
    expect(await tool.execute({})).toMatchObject({ canvasId: "canvas-a" });
    vi.spyOn(canvas, "getState").mockReturnValue({ ...canvas.getState(), activeCanvasId: "canvas-b" });
    expect(await tool.execute({})).toMatchObject({ canvasId: "canvas-b" });
    expect(canvas.materializeSession).toHaveBeenLastCalledWith("canvas-b");
  });
});
