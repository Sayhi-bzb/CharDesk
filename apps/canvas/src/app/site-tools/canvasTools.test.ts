import { describe, expect, it, vi } from "vitest";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { createCanvasManageTool, createCanvasReadTool, createCanvasSearchTool } from "./canvasTools";
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
  it("forwards regex, case folding, and spatial templates with actionable errors", async () => {
    const canvas = host();
    const tool = createCanvasSearchTool(canvas);
    expect(await tool.execute({ query: "a", ignoreCase: true })).toMatchObject({ matches: [{ content: expect.stringContaining("A") }] });
    expect(await tool.execute({ query: "[a-z]", regex: true, ignoreCase: true })).toMatchObject({ matches: [{ content: expect.stringContaining("A") }] });
    expect(await tool.execute({ query: "A\nB" })).toMatchObject({ matches: [] });
    expect(await tool.execute({ query: "[", regex: true })).toMatchObject({ code: "invalid_input" });
    canvas.materializeSession.mockResolvedValue({ id: "canvas-a", name: "Example", mode: "freeform", slideDeck: null,
      surface: createGridSurfaceReader(new Map([["0,0", { char: "A", color: "#000" }], ["1000000,0", { char: "B", color: "#000" }]])) });
    expect(await tool.execute({ query: "A.*B", regex: true })).toMatchObject({ code: "search_limit", message: expect.stringContaining("Narrow viewport") });
  });
  it("captures the session, returns Cell bounds, and is read-only", async () => {
    const canvas = host();
    const tool = createCanvasSearchTool(canvas);
    expect(tool.readOnly).toBe(true);
    expect(await tool.execute({ query: "A" })).toMatchObject({ matches: [{ origin: [0, 0], bounds: [0, 0, 1, 1], content: "A" }], next: null });
    expect(canvas.materializeSession).toHaveBeenCalledWith("canvas-a");
    expect(await tool.execute({ query: "A", viewport: [1, 0, 10, 1] })).toMatchObject({ matches: [] });
    expect(await tool.execute({ query: "A", after: [0, 0] })).toMatchObject({ matches: [] });
  });

  it("validates arguments before reading and handles unavailable content", async () => {
    const canvas = host();
    const tool = createCanvasSearchTool(canvas);
    for (const input of [{}, { query: " " }, { query: "A\n\nB" }, { query: "A", regex: "true" }, { query: "A", ignoreCase: 1 },
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
    expect(await createCanvasSearchTool(canvas).execute({ query: "A" })).toMatchObject({ matches: [{ origin: [0, 0], bounds: [0, 0, 1, 1] }] });
  });
});

describe("Canvas management tool", () => {
  it("uses persistent Canvas IDs directly across tool calls", async () => {
    const sessions = [{ id: "canvas-a", name: "A", mode: "freeform" as const }, { id: "canvas-b", name: "B", mode: "freeform" as const }];
    const canvas = {
      ...host(),
      getState: () => ({ activeCanvasId: "canvas-a", canvasSessions: sessions }) as ReturnType<CanvasRuntime["getState"]>,
      commands: { sessions: { create: vi.fn(), rename: vi.fn(), archive: vi.fn() } },
    };
    const listed = await createCanvasManageTool(canvas).execute({ action: "list" });
    expect(listed).toMatchObject({ canvases: [{ canvasId: "canvas-a" }, { canvasId: "canvas-b" }] });
    expect(JSON.stringify(listed)).toContain("canvas-a");
    sessions.reverse();
    expect(await createCanvasManageTool(canvas).execute({ action: "list" })).toMatchObject({ canvases: [{ canvasId: "canvas-b" }, { canvasId: "canvas-a" }] });
    const search = createCanvasSearchTool(canvas);
    expect(await search.execute({ query: "A", canvasId: "canvas-b" })).toMatchObject({ canvasId: "canvas-b" });
    expect(canvas.materializeSession).toHaveBeenLastCalledWith("canvas-b");
    expect(await search.execute({ query: "A", canvasId: "canvas-b" })).toMatchObject({ canvasId: "canvas-b" });
    expect(await search.execute({ query: "A", canvasId: "canvas-b" })).toMatchObject({ canvasId: "canvas-b" });
    expect(await search.execute({ query: "A", canvasId: "c99" })).toMatchObject({ code: "canvas_not_found" });
    expect(await createCanvasReadTool(canvas, rendering).execute({ canvasId: "canvas-b" })).toMatchObject({ canvasId: "canvas-b" });
    sessions.splice(sessions.findIndex(({ id }) => id === "canvas-b"), 1);
    expect(await search.execute({ query: "A", canvasId: "canvas-b" })).toMatchObject({ code: "canvas_not_found" });
    const active = await createCanvasReadTool(canvas, rendering).execute({});
    expect(active).not.toHaveProperty("canvasId");
    expect(active).not.toHaveProperty("canvasId");
  });

  it("lists, creates, renames, and archives sessions", async () => {
    const sessions = [
      { id: "canvas-a", name: "Example", mode: "freeform" as const },
      { id: "canvas-archived", name: "Old", mode: "freeform" as const, archived: true },
    ];
    const canvas = {
      ready: Promise.resolve(),
      getState: () => ({ activeCanvasId: "canvas-a", canvasSessions: sessions }) as ReturnType<CanvasRuntime["getState"]>,
      commands: { sessions: {
        create: vi.fn(() => ({ id: "canvas-b", name: "New", mode: "freeform" as const })),
        rename: vi.fn(), archive: vi.fn(() => true),
      } },
    } as unknown as Pick<CanvasRuntime, "ready" | "getState"> & { commands: { sessions: Pick<CanvasRuntime["commands"]["sessions"], "create" | "rename" | "archive"> } };
    const tool = createCanvasManageTool(canvas);
    expect(await tool.execute({ action: "list" })).toMatchObject({
      currentCanvasId: "canvas-a",
      currentCanvas: { canvasId: "canvas-a", archived: false },
      canvases: [{ canvasId: "canvas-a", archived: false }],
    });
    expect(await tool.execute({ action: "list", includeArchived: true })).toMatchObject({
      canvases: [{ canvasId: "canvas-a", archived: false }, { canvasId: "canvas-archived", archived: true }],
    });
    expect(await tool.execute({ action: "list", includeArchived: "yes" as never })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ action: "create", name: "New" })).toMatchObject({ canvasId: "canvas-b" });
    expect(await tool.execute({ action: "rename", canvasId: "canvas-a", name: "Renamed" })).toMatchObject({ canvasId: "canvas-a", name: "Renamed" });
    expect(await tool.execute({ action: "archive", canvasId: "canvas-a" })).toEqual({ canvasId: "canvas-a", archived: true });
  });

  it("does not promote an archived active descriptor to the current Canvas", async () => {
    const canvas = {
      ready: Promise.resolve(),
      getState: () => ({ activeCanvasId: "canvas-a", canvasSessions: [{ id: "canvas-a", name: "Archived", mode: "freeform" as const, archived: true }] }) as ReturnType<CanvasRuntime["getState"]>,
      commands: { sessions: { create: vi.fn(), rename: vi.fn(), archive: vi.fn() } },
    } as unknown as Pick<CanvasRuntime, "ready" | "getState"> & { commands: { sessions: Pick<CanvasRuntime["commands"]["sessions"], "create" | "rename" | "archive"> } };
    expect(await createCanvasManageTool(canvas).execute({ action: "list" })).toMatchObject({ currentCanvasId: null, currentCanvas: null });
  });
});

describe("Canvas reading tool", () => {
  it("captures the target session and reads it without switching it", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas, rendering);
    expect(tool.readOnly).toBe(true);
    expect(await tool.execute({ viewport: [0, 0, 4, 2] })).toMatchObject({ viewport: [0, 0, 4, 2], mode: "text", overviewOnly: false });
    expect(canvas.materializeSession).toHaveBeenCalledWith("canvas-a");
    expect(await tool.execute({ viewport: [0, 0, 4, 2], style: "appearance" })).toMatchObject({
      content: expect.stringContaining("y=0 x=0{fg:#000}"),
    });
  });

  it("keeps text as the default and exposes optional image blocks", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas, rendering);
    const text = await tool.execute({ viewport: [0, 0, 4, 2] });
    expect(text).toMatchObject({ representation: "text", style: "none", appearance: null, contentBlocks: [{ type: "text" }] });
    expect((text as { content: string }).content).not.toContain("styles:");
    const appearance = await tool.execute({ viewport: [0, 0, 4, 2], style: "appearance" });
    expect(appearance).toMatchObject({ style: "appearance", appearance: { regions: [{ bounds: [0, 0, 1, 1], style: { color: "#000" } }] } });
    const image = await tool.execute({ viewport: [0, 0, 4, 2], representation: "image", detail: "low" });
    expect(image).toMatchObject({ representation: "image", content: "", image: null, contentBlocks: [{ type: "note", text: "Image unavailable; use representation: text." }] });
    const both = await tool.execute({ viewport: [0, 0, 4, 2], representation: "both" });
    expect(both).toMatchObject({ representation: "both", contentBlocks: [{ type: "text" }] });
  });

  it("returns actionable errors for invalid input and missing sessions", async () => {
    const tool = createCanvasReadTool(host(null), rendering);
    expect(await tool.execute({})).toMatchObject({ code: "canvas_not_active" });
    expect(await tool.execute({ viewport: [0, 0, -1, 1] })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ scale: 2 })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ representation: "video" })).toMatchObject({ code: "invalid_input" });
    expect(await tool.execute({ detail: "nearest" })).toMatchObject({ code: "invalid_input" });
    const canvas = host();
    canvas.materializeSession.mockResolvedValue(null as never);
    expect(await createCanvasReadTool(canvas, rendering).execute({})).toMatchObject({ code: "canvas_not_ready" });
  });

  it("follows the active session on each call", async () => {
    const canvas = host();
    const tool = createCanvasReadTool(canvas, rendering);
    expect(await tool.execute({})).toMatchObject({ viewport: [0, 0, 1, 1] });
    vi.spyOn(canvas, "getState").mockReturnValue({ ...canvas.getState(), activeCanvasId: "canvas-b" });
    expect(await tool.execute({})).toMatchObject({ viewport: [0, 0, 1, 1] });
    expect(canvas.materializeSession).toHaveBeenLastCalledWith("canvas-b");
  });
});
