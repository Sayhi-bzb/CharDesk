import { afterEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { createCanvasRuntime, type CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool, createCanvasSearchTool, createCanvasPreviewWriteTool } from "./canvasTools";
import { createTextRenderingRuntime, DEFAULT_TEXT_RENDER_PROFILE } from "@/domains/document/public";
const runtime = createTextRenderingRuntime();
runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "raw" });
const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };

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

  it("renders a real preview without mutating the Canvas", async () => {
    const canvas = host();
    const runtime = createTextRenderingRuntime();
    runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "markdown" });
    const preview = createCanvasPreviewWriteTool(canvas, {
      render: runtime.renderCompact,
      getProfile: runtime.getProfile,
      getContext: () => ({ themeMode: "light" as const }),
    });
    const result = await preview.execute({ at: [-4, 3], content: "**Hello**", writeMode: "replace" });
    expect(result).toMatchObject({ preview: true, bounds: [-4, 3, 5, 1], writtenCells: 5 });
    expect(result).toMatchObject({ rendered: { kind: "spans", rows: expect.any(Array) } });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
  });

  it("renders Markdown, searches exact glyph positions, and reads styles without changing editor state", async () => {
    const canvas = host();
    const runtime = createTextRenderingRuntime();
    const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };
    const write = createCanvasWriteTool(canvas, rendering);
    const search = createCanvasSearchTool(canvas);
    await write.execute({ at: [-100, -50], content: "**Needle** 你é", writeMode: "replace" });
    const state = canvas.getState();
    const camera = canvas.viewport.getSnapshot();
    const found = await search.execute({ query: "Needle", viewport: [-100, -50, 800, 240] });
    expect(found).toMatchObject({ matches: [{ origin: [-100, -50], bounds: [-100, -50, 6, 1], content: "Needle" }], next: null });
    const read = await createCanvasReadTool(canvas, rendering).execute({ viewport: [-100, -50, 6, 1] });
    expect(read).toMatchObject({ content: expect.stringContaining("bold") });
    expect(await search.execute({ query: "**Needle**" })).toMatchObject({ matches: [] });
    expect(await search.execute({ query: "你é" })).toMatchObject({ matches: [{ origin: [-93, -50], bounds: [-93, -50, 3, 1], content: "你é" }] });
    expect(canvas.getState().interaction).toEqual(state.interaction);
    expect(canvas.getState().canUndo).toBe(state.canUndo);
    expect(canvas.viewport.getSnapshot()).toEqual(camera);
    canvas.commands.history.undo();
    expect(await search.execute({ query: "Needle" })).toMatchObject({ matches: [] });
  });

  it("writes graphemes at signed coordinates without changing interaction and undoes each call separately", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas, rendering);
    const interaction = canvas.getState().interaction;
    const camera = canvas.viewport.getSnapshot();
    expect(tool.readOnly).toBe(false);
    expect(await tool.execute({ at: [-5, -2], content: "你é\nABCD", writeMode: "replace" })).toMatchObject({ bounds: [-5, -2, 4, 2], writeMode: "replace" });
    expect(await tool.execute({ at: [-5, -1], content: "X ", writeMode: "replace" })).toMatchObject({ bounds: [-5, -1, 2, 1], writeMode: "replace" });
    const view = await createCanvasReadTool(canvas, rendering).execute({ viewport: [-5, -2, 4, 2] });
    expect(view).toMatchObject({ content: expect.stringContaining("你é") });
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
    const tool = createCanvasWriteTool(canvas, rendering);
    for (const input of [{ at: [0], content: "A" },
      { at: [Number.MAX_SAFE_INTEGER, 0], content: "AB" }, { at: [0, 0], content: "A", viewport: [0, 0, 1, 1] }]) {
      expect(await tool.execute(input)).toMatchObject({ code: "invalid_input" });
    }
    expect(await tool.execute({ at: [0, 0], content: "\n", writeMode: "replace" })).toMatchObject({ bounds: null, writeMode: "replace" });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
  });

  it("rejects source projections and Slide overflow instead of silently clipping", async () => {
    const canvas = host();
    canvas.commands.sessions.openSource({ kind: "blackboard", provider: "browser-workspace", id: "source-a" });
    expect(await createCanvasWriteTool(canvas, rendering).execute({ at: [0, 0], content: "A" })).toMatchObject({ code: "source_backed_canvas" });
    canvas.commands.sessions.create("slide");
    expect(await createCanvasWriteTool(canvas, rendering).execute({ at: [-1, 0], content: "A" })).toMatchObject({ code: "out_of_bounds" });
    expect(await createCanvasWriteTool(canvas, rendering).execute({ at: [0, 0], content: "A" })).toMatchObject({ bounds: [0, 0, 1, 1] });
  });

  it("preserves empty rows and reports only the envelope of written positions", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas, rendering);
    await tool.execute({ at: [0, 0], content: "ABCD\nEFGH\nIJKL", writeMode: "replace" });
    expect(await tool.execute({ at: [0, 0], content: "\r\n你\r\n\r\nZ", writeMode: "replace" })).toMatchObject({ bounds: [0, 1, 2, 3], writeMode: "replace" });
    const reader = canvas.getState().contentSurface.reader;
    expect(reader.getCell({ x: 0, y: 0 })?.char).toBe("A");
    expect(reader.getCell({ x: 2, y: 1 })?.char).toBe("G");
    expect(reader.getCell({ x: 0, y: 2 })?.char).toBe("I");
    await tool.execute({ at: [1, 1], content: "X" });
    expect(reader.getCell({ x: 0, y: 1 })).toBeUndefined();
    expect(reader.getCell({ x: 1, y: 1 })?.char).toBe("X");
  });

  it("defaults to a sparse patch and requires replace to clear whitespace", async () => {
    const canvas = host();
    const tool = createCanvasWriteTool(canvas, rendering);
    const reader = canvas.getState().contentSurface.reader;
    await tool.execute({ at: [0, 0], content: "ABCDE", writeMode: "replace" });
    const patch = await tool.execute({ at: [0, 0], content: "X   Z" });
    expect(patch).toMatchObject({ writeMode: "patch", bounds: [0, 0, 5, 1], writtenCells: 2, skippedWhitespaceCells: 3 });
    expect(reader.getCell({ x: 0, y: 0 })?.char).toBe("X");
    expect(reader.getCell({ x: 1, y: 0 })?.char).toBe("B");
    expect(reader.getCell({ x: 2, y: 0 })?.char).toBe("C");
    expect(reader.getCell({ x: 3, y: 0 })?.char).toBe("D");
    expect(reader.getCell({ x: 4, y: 0 })?.char).toBe("Z");
    const whitespaceOnly = await tool.execute({ at: [0, 0], content: "   " });
    expect(whitespaceOnly).toMatchObject({ writeMode: "patch", bounds: null, writtenCells: 0, skippedWhitespaceCells: 3 });
    await tool.execute({ at: [0, 0], content: "X   Z", writeMode: "replace" });
    expect(reader.getCell({ x: 1, y: 0 })?.char).toBe(" ");
    expect(reader.getCell({ x: 2, y: 0 })?.char).toBe(" ");
    expect(reader.getCell({ x: 3, y: 0 })?.char).toBe(" ");
  });

  it("uses the same Markdown renderer and live profile as Canvas text rendering", async () => {
    const canvas = host();
    const runtime = createTextRenderingRuntime();
    runtime.setProfile({ ...runtime.getProfile(), mode: "markdown" });
    const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "dark" as const }) };
    const tool = createCanvasWriteTool(canvas, rendering);
    const interaction = canvas.getState().interaction;
    const source = "**Hello** and `code` [link](https://example.com)";
    const rendered = await rendering.render(source, canvas.getState().brushColor, rendering.getContext());
    if (rendered.kind !== "spans") throw new Error("Expected rendered spans");
    expect(await tool.execute({ at: [-10, 5], content: source, writeMode: "replace" })).toMatchObject({ bounds: expect.any(Array) });
    const reader = canvas.getState().contentSurface.reader;
    for (const row of rendered.rows) for (const span of row.spans) {
      const cell = reader.getCell({ x: -10 + span.x, y: 5 + row.y });
      expect(cell?.color).toBe(span.color);
      expect(cell?.attrs).toEqual(span.attrs);
      expect(cell?.href).toBe(span.href);
      expect(cell?.bgColor).toBe(span.bgColor);
    }
    expect(canvas.getState().interaction).toEqual(interaction);
    const view = await createCanvasReadTool(canvas, rendering).execute({ viewport: [-10, 5, 60, 10] });
    expect(view).toMatchObject({ content: expect.stringContaining("Write rendering (current settings, not content provenance): mode=markdown") });
    expect(view).toMatchObject({ content: expect.stringContaining("bold") });
    runtime.setProfile({ ...runtime.getProfile(), mode: "raw" });
    expect(await tool.execute({ at: [0, 30], content: "**Hello**" })).toMatchObject({ bounds: [0, 30, 9, 1] });
    expect(reader.getCell({ x: 0, y: 30 })?.char).toBe("*");
    canvas.commands.history.undo();
    expect(reader.getCell({ x: 0, y: 30 })).toBeUndefined();
    canvas.commands.history.undo();
    expect(reader.getContentBounds()).toBeNull();
  });

  it("renders ANSI styles, expands tabs, and preserves or replaces target backgrounds", async () => {
    const canvas = host();
    const runtime = createTextRenderingRuntime();
    runtime.setProfile({ ...runtime.getProfile(), mode: "ansi" });
    const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };
    const tool = createCanvasWriteTool(canvas, rendering);
    expect(await tool.execute({ at: [0, 0], content: "\x1b[41mAB\x1b[0m", writeMode: "replace" })).toMatchObject({ bounds: [0, 0, 2, 1] });
    const reader = canvas.getState().contentSurface.reader;
    const background = reader.getCell({ x: 0, y: 0 })?.bgColor;
    expect(background).toBeTruthy();
    await tool.execute({ at: [0, 0], content: "\x1b[41m \x1b[0m" });
    expect(reader.getCell({ x: 0, y: 0 })?.char).toBe(" ");
    expect(reader.getCell({ x: 0, y: 0 })?.bgColor).toBe(background);
    await tool.execute({ at: [0, 0], content: "\x1b[1;32mC\x1b[0m", writeMode: "replace" });
    expect(reader.getCell({ x: 0, y: 0 })).toMatchObject({ char: "C", bgColor: background, attrs: { bold: true } });
    await tool.execute({ at: [0, 0], content: "\x1b[44mD\x1b[0m", writeMode: "replace" });
    expect(reader.getCell({ x: 0, y: 0 })?.bgColor).not.toBe(background);
    runtime.setProfile({ ...runtime.getProfile(), mode: "raw" });
    expect(await tool.execute({ at: [0, 2], content: "\tB", writeMode: "replace" })).toMatchObject({ bounds: [0, 2, 5, 1] });
    expect(reader.getCell({ x: 4, y: 2 })?.char).toBe("B");
  });

  it("rejects rendered overflow atomically and never writes to a changed target", async () => {
    const canvas = host();
    canvas.commands.sessions.create("slide");
    const runtime = createTextRenderingRuntime();
    runtime.setProfile({ ...runtime.getProfile(), mode: "markdown", markdownWrapEnabled: false });
    const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };
    expect(await createCanvasWriteTool(canvas, rendering).execute({ at: [0, 0], content: `**${"x".repeat(101)}**` })).toMatchObject({ code: "out_of_bounds" });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
    const delayed = { ...rendering, render: async (...args: Parameters<typeof runtime.renderCompact>) => {
      const result = await runtime.renderCompact(...args);
      canvas.commands.sessions.create("freeform");
      return result;
    } };
    expect(await createCanvasWriteTool(canvas, delayed).execute({ at: [0, 0], content: "**Hello**" })).toMatchObject({ code: "write_failed" });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
    const failed = { ...rendering, render: async () => { throw new Error("Renderer failed"); } };
    expect(await createCanvasWriteTool(canvas, failed).execute({ at: [0, 0], content: "Hello" })).toMatchObject({ code: "write_failed" });
    expect(canvas.getState().contentSurface.reader.getContentBounds()).toBeNull();
  });
});
