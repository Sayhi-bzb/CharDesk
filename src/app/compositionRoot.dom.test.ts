import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { DEFAULT_TEXT_RENDER_PROFILE } from "@/domains/document/public";
import { gridEntriesToCellPlaneOperation } from "@/domains/canvas/public";
import { createCanvasVisualThemeFixture } from "@/shared/canvas-appearance/test-theme";
import {
  createApplicationEditorHost,
  getApplicationEditorHost,
  releaseApplicationEditorHost,
  type ApplicationEditorHost,
} from "./compositionRoot";

const hosts: ApplicationEditorHost[] = [];
const createHost = () => {
  const host = createApplicationEditorHost();
  hosts.push(host);
  return host;
};

afterEach(async () => {
  await releaseApplicationEditorHost();
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

describe("ApplicationEditorHost", () => {
  it("releases the singleton host idempotently before creating a replacement", async () => {
    const first = getApplicationEditorHost();
    const dispose = vi.spyOn(first, "dispose");

    await releaseApplicationEditorHost();
    await releaseApplicationEditorHost();

    expect(dispose).toHaveBeenCalledOnce();
    expect(getApplicationEditorHost()).not.toBe(first);
  });

  it("routes clipboard text through the host rendering profile before Canvas mutation", async () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
    host.textRendering.setProfile({
      ...DEFAULT_TEXT_RENDER_PROFILE,
      mode: "markdown",
    });

    const result = await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) =>
          type === "text/plain" ? "**粗体**" : "",
      } as unknown as DataTransfer,
    });

    expect(result).toMatchObject({ status: "applied" });
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")).toMatchObject({
      char: "粗",
      attrs: { bold: true },
    });
    expect(host.canvas.getState().contentSurface.reader.materialize().get("2,0")?.char).toBe("体");
    expect(host.canvas.getState().contentSurface.reader.materialize().has("1,0")).toBe(false);
  });

  it("persists external inline-code rendering into GridMap cells", async () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
    host.textRendering.setProfile({
      ...DEFAULT_TEXT_RENDER_PROFILE,
      mode: "auto",
    });

    const result = await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain" ? "`remark`" : "",
      } as unknown as DataTransfer,
    });

    expect(result).toMatchObject({ status: "applied" });
    expect(
      Array.from(host.canvas.getState().contentSurface.reader.materialize().values()).map((cell) => cell.char).join("")
    ).toBe("remark");
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.color).toBe("#0969da");
  });

  it("pastes Markdown thematic breaks without centering prose", async () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
    const source = [
      "也就是说，**不需要某一天突然出现“自我修改源码”的 AGI。**",
      "",
      "Codex/Research Agent 今天帮助研究员写代码、跑实验、分析结果，本身就可以是 RSI 的早期形态。",
      "",
      "文章明确说，OpenAI 正把研究方向朝 RSI 集中，因为他们认为继续处于 AI 前沿最终必须走这条路。([OpenAI][1])",
      "",
      "---",
    ].join("\n");

    const result = await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain" ? source : "",
      } as unknown as DataTransfer,
    });
    const cells = [...host.canvas.getState().contentSurface.reader.materialize()]
      .map(([key, cell]) => ({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]), cell }));
    const populatedRows = [...new Set(cells.map(({ y }) => y))]
      .map((y) => cells.filter((cell) => cell.y === y));

    expect(result).toMatchObject({ status: "applied" });
    expect(populatedRows.every((row) => Math.min(...row.map(({ x }) => x)) === 0))
      .toBe(true);
    expect(cells.filter(({ y }) => y === Math.max(...cells.map((item) => item.y)))
      .map(({ cell }) => cell.char).join(""))
      .toBe("———");
  });

  it("freezes the resolved theme into each pasted Markdown result", async () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.textRendering.setProfile({
      ...DEFAULT_TEXT_RENDER_PROFILE,
      mode: "markdown",
    });
    host.canvasAppearance.sync("dark", createCanvasVisualThemeFixture({
      canvas: {
        artifact: {
          foreground: "#f0f6fc",
          background: "#0d1117",
          grid: "#21262d",
        },
      },
    }));
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });

    await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain" ? "**Dark** `code`" : "",
      } as unknown as DataTransfer,
    });
    const darkCells = host.canvas.getState().contentSurface.reader.materialize();
    expect(darkCells.get("0,0")?.color).toBe("#f0f6fc");
    expect(darkCells.get("5,0")).toMatchObject({
      color: "#58a6ff",
      bgColor: "#161b22",
    });

    host.canvasAppearance.sync("light", createCanvasVisualThemeFixture());
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.color)
      .toBe("#f0f6fc");
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 2 });
    await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain" ? "**Light** `code`" : "",
      } as unknown as DataTransfer,
    });
    const lightCells = host.canvas.getState().contentSurface.reader.materialize();
    expect(lightCells.get("0,2")?.color).toBe("#1f2328");
    expect(lightCells.get("6,2")).toMatchObject({
      color: "#0969da",
      bgColor: "#f6f8fa",
    });
  });

  it("persists pasted Mermaid diagrams as editable Unicode grid cells", async () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
    host.textRendering.setProfile({
      ...DEFAULT_TEXT_RENDER_PROFILE,
      mode: "markdown",
    });

    const result = await host.canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain"
          ? "```mermaid\ngraph LR\n  A --> B\n```"
          : "",
      } as unknown as DataTransfer,
    });

    expect(result).toMatchObject({ status: "applied" });
    const chars = Array.from(host.canvas.getState().contentSurface.reader.materialize().values(), (cell) => cell.char);
    expect(chars).toContain("╭");
    expect(chars).toContain(">");
    expect(chars).not.toContain("`");
  });

  it("accepts a fixed external session without creating demo sessions", () => {
    const host = createApplicationEditorHost({
      initialSessions: [{
        id: "external-source",
        name: "Board",
        mode: "freeform",
        grid: [],
      }],
    });
    hosts.push(host);

    expect(host.canvas.getState().canvasSessions).toHaveLength(1);
    expect(host.canvas.getState().activeCanvasId).toBe("external-source");
    expect(host.canvas.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("projects revisions into the same session and resets interaction history", () => {
    const host = createApplicationEditorHost({
      initialSessions: [{
        id: "external-source",
        name: "Board",
        mode: "freeform",
        grid: [],
      }],
    });
    hosts.push(host);
    host.canvas.commands.viewport.setViewport(() => ({
      offset: { x: 120, y: 80 },
      zoom: 1.5,
    }));
    host.canvas.commands.interaction.setTextCursor({ x: 4, y: 2 });
    host.canvas.commands.text.write("local");
    expect(host.canvas.getState().canUndo).toBe(true);

    host.canvas.commands.sessions.replaceSnapshot(
      "external-source",
      {
        mode: "freeform",
        grid: [["0,0", { char: "外", color: "#ffffff" }]],
      },
      { preserveViewport: true, resetHistory: true }
    );

    const state = host.canvas.getState();
    expect(state.canvasSessions).toHaveLength(1);
    expect(state.activeCanvasId).toBe("external-source");
    expect(state.contentSurface.reader.materialize().get("0,0")?.char).toBe("外");
    expect(host.canvas.viewport.getSnapshot()).toEqual({
      offset: { x: 120, y: 80 },
      zoom: 1.5,
    });
    expect(state.interaction.textCursor).toBeNull();
    expect(state.canUndo).toBe(false);
    expect(host.canvas.commands.history.undo()).toBe(false);
  });

  it("isolates canvas state, history, commands, and editor tools by instance", () => {
    const first = createHost();
    const second = createHost();
    first.canvas.commands.grid.replace([]);
    second.canvas.commands.grid.replace([]);

    first.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
    first.canvas.commands.text.write("A");
    first.editor.setCurrentTool("brush");

    expect(first.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(first.canvas.getState().canUndo).toBe(true);
    expect(first.editor.getCurrentToolId()).toBe("brush");
    expect(second.canvas.getState().contentSurface.reader.materialize()).toEqual(new Map());
    expect(second.canvas.getState().canUndo).toBe(false);
    expect(second.editor.getCurrentToolId()).toBe("select");

    expect(first.canvas.commands.history.undo()).toBe(true);
    expect(first.canvas.getState().contentSurface.reader.materialize()).toEqual(new Map());
    expect(second.canvas.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("preserves remote Yjs content when the same instance edits next", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    const documentId = host.canvas.queries.getActiveDocumentId();
    const local = host.canvas.queries.getCollaborationDocument(documentId)!;
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    const pageId = remote.getArray<string>("document-page-order").get(0)!;
    remote.getArray(`canvas-page:${encodeURIComponent(pageId)}:cell-plane-operations`).push([
      gridEntriesToCellPlaneOperation("remote:1", [["0,0", {
        char: "R",
        color: "#ffffff",
      }]])!,
    ]);

    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
    host.canvas.commands.interaction.setTextCursor({ x: 1, y: 0 });
    host.canvas.commands.text.write("L");

    expect(Object.fromEntries(host.canvas.getState().contentSurface.reader.materialize())).toMatchObject({
      "0,0": { char: "R", color: "#ffffff" },
      "1,0": { char: "L" },
    });
  });

  it("rejects an empty persistence namespace", () => {
    expect(() =>
      createApplicationEditorHost({
        canvasPersistence: { storage: localStorage, key: "" },
      })
    ).toThrow("Canvas persistence requires a non-empty instance key");
  });
});
