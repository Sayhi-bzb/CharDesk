import { expect, test } from "vitest";
import { createApplicationEditorHost } from "@/app/compositionRoot";
import { FreeformEditorSession } from "@chardesk/editor-core/runtime";
import {
  buildRichClipboardHtml,
  parseRichClipboardHtml,
} from "@chardesk/editor-core/clipboard/rich";

test("Web copy → native rich paste → native copy → Web paste retains wide glyph styles, links and undo", async () => {
  const host = createApplicationEditorHost(),
    terminal = new FreeformEditorSession();
  const formats = new Map<string, string>();
  let html = "";
  const finish = async (result: ReturnType<typeof terminal.commands.paste>) => {
    if (result.status !== "pending") throw new Error("Expected clipboard continuation");
    expect((await result.completion).succeeded).toBe(true);
  };
  try {
    const cell = {
      char: "🦀",
      color: "#123456",
      bgColor: "#abcdef",
      attrs: { bold: true as const, underline: true as const },
      href: "https://example.com",
    };
    const canvas = host.canvas;
    canvas.commands.grid.replace([["-3,0", cell]]);
    canvas.commands.staticGrid.setSelectionRange({ start: { x: -2, y: 0 }, end: { x: -2, y: 0 } });
    expect(
      await canvas.commands.selection.copy({
        rich: true,
        event: {
          preventDefault() {},
          clipboardData: { setData: (type: string, value: string) => formats.set(type, value) },
        } as unknown as ClipboardEvent,
      })
    ).toMatchObject({ status: "applied" });
    html = formats.get("text/html")!;
    terminal.configureClipboard({
      read: async () => parseRichClipboardHtml(html) ?? { error: "unsupported-data" },
      write: async (payload) => {
        html = buildRichClipboardHtml(payload)!;
        return { status: "written" };
      },
    });
    await finish(terminal.commands.paste());
    expect(terminal.plane.get({ x: 0, y: 0 })).toEqual(cell);
    expect(terminal.plane.get({ x: 1, y: 0 })).toBeUndefined();
    await finish(terminal.commands.copy({ rich: true }));
    canvas.commands.staticGrid.setActiveCell({ x: 4, y: 2 });
    expect(
      await canvas.commands.selection.paste({
        eventDataTransfer: {
          getData: (type: string) =>
            type === "text/html" ? html : type === "text/plain" ? "🦀" : "",
        } as DataTransfer,
      })
    ).toMatchObject({ status: "applied", changed: true });
    expect(canvas.getState().contentSurface.reader.get({ x: 4, y: 2 })).toEqual(cell);
    expect(canvas.getState().contentSurface.reader.get({ x: 5, y: 2 })).toBeUndefined();
    canvas.commands.history.undo();
    expect(canvas.getState().contentSurface.reader.get({ x: 4, y: 2 })).toBeUndefined();
    expect(canvas.getState().contentSurface.reader.get({ x: -3, y: 0 })).toEqual(cell);
  } finally {
    terminal.dispose();
    await host.dispose();
  }
});

test("Web clipboard availability and preparation stay bounded for billion-row ranges", async () => {
  const host = createApplicationEditorHost();
  try {
    const canvas = host.canvas;
    canvas.commands.grid.replace([["0,0", { char: "A", color: "#000000" }]]);
    canvas.commands.staticGrid.setSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1_000_000_000 },
    });
    expect(await canvas.commands.selection.copy()).toMatchObject({
      status: "failed",
      reason: "prepare-failed",
    });
    expect(await canvas.commands.selection.cut()).toMatchObject({
      status: "failed",
      reason: "prepare-failed",
    });
    expect(canvas.getState().contentSurface.reader.get({ x: 0, y: 0 })?.char).toBe("A");
  } finally {
    await host.dispose();
  }
});

test("Web Markdown paste fits a CJK table to the configured width and keeps links", async () => {
  const host = createApplicationEditorHost();
  const source = [
    "| Skill 的分支 | 具体借鉴了什么 |",
    "|---|---|",
    `| **找一批 ETF** | ${"确定候选范围 → 规范化条件 → 筛选 → 核验结果。".repeat(4)} [参考链接](https://example.com) |`,
    "| **比较已知几只** | 先看投资敞口和基准，再查收益和风险。 |",
  ].join("\n");
  try {
    const { canvas, textRendering } = host;
    canvas.commands.grid.replace([]);
    const paste = () => canvas.commands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === "text/plain" ? source : "",
      } as DataTransfer,
    });
    for (const width of [80, 60]) {
      textRendering.setProfile({ ...textRendering.getProfile(), markdownWrapWidth: width });
      canvas.commands.staticGrid.setActiveCell({ x: 0, y: 0 });
      expect(await paste()).toMatchObject({ status: "applied", changed: true });
      const reader = canvas.getState().contentSurface.reader;
      const bounds = reader.getContentBounds();
      expect(bounds?.width).toBeLessThanOrEqual(width);
      expect(bounds?.height).toBeGreaterThan(5);
      expect([...reader.materialize().values()].some(cell => cell.href === "https://example.com")).toBe(true);
      canvas.commands.history.undo();
    }
    textRendering.setProfile({ ...textRendering.getProfile(), markdownWrapEnabled: false });
    expect(await paste()).toMatchObject({ status: "applied", changed: true });
    expect(canvas.getState().contentSurface.reader.getContentBounds()?.width).toBeGreaterThan(80);
  } finally {
    await host.dispose();
  }
});
