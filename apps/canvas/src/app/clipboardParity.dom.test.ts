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
