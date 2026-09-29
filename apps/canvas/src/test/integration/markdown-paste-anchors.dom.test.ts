import { afterEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { createCanvasRuntime, type CanvasRuntime } from "@/domains/canvas/public";
import {
  createTextRenderingRuntime,
  DEFAULT_TEXT_RENDER_PROFILE,
} from "@/domains/document/public";

const clipboard = (text: string) => ({
  getData: (type: string) => type === "text/plain" ? text : "",
}) as DataTransfer;

describe("Markdown paste anchors", () => {
  const runtimes: CanvasRuntime[] = [];
  afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.dispose()));

  const setup = () => {
    const textRendering = createTextRenderingRuntime({ storage: false });
    const canvas = createCanvasRuntime({
      persistence: false,
      selectionCommands: createSelectionCommandFactory({
        renderClipboardText: textRendering.renderCompact,
        getMarkdownAutoAnchorsEnabled: () =>
          textRendering.getProfile().markdownAutoAnchorsEnabled,
      }),
      parseSessionSource: async () => ({ mode: "freeform", grid: [] }),
      initialSessions: [{ id: "canvas", name: "Canvas", mode: "freeform", grid: [] }],
    });
    runtimes.push(canvas);
    return { canvas, textRendering };
  };

  it("creates nested anchors at pasted heading cells and undoes everything together", async () => {
    const { canvas } = setup();
    canvas.commands.staticGrid.setActiveCell({ x: 10, y: 20 });

    const result = await canvas.commands.selection.paste({
      eventDataTransfer: clipboard([
        "# Intro", "", "## Details", "", "### Leaf", "", "```md", "# Not a heading", "```",
      ].join("\n")),
    });

    expect(result).toMatchObject({ status: "applied" });
    const anchors = canvas.documents.getAnchorsAt(canvas.documents.getActiveAddress());
    expect(anchors.map(({ label, parentId, point }) => ({ label, parentId, point })))
      .toEqual([
        { label: "# Intro", parentId: null, point: { x: 10, y: 20 } },
        { label: "## Details", parentId: anchors[0]?.id, point: { x: 10, y: expect.any(Number) } },
        { label: "### Leaf", parentId: anchors[1]?.id, point: { x: 10, y: expect.any(Number) } },
      ]);
    expect(anchors[1]!.point.y).toBeGreaterThan(anchors[0]!.point.y);
    expect(anchors[2]!.point.y).toBeGreaterThan(anchors[1]!.point.y);
    expect(canvas.documents.getContentReader().getCell({ x: 10, y: 20 })?.char).toBe("#");

    expect(canvas.commands.history.undo()).toBe(true);
    expect(canvas.documents.getAnchorsAt(canvas.documents.getActiveAddress())).toHaveLength(0);
    expect(canvas.documents.getContentReader().getCell({ x: 10, y: 20 })).toBeUndefined();
    expect(canvas.commands.history.redo()).toBe(true);
    expect(canvas.documents.getAnchorsAt(canvas.documents.getActiveAddress())).toHaveLength(3);
  });

  it("respects the setting and renderer mode for later pastes", async () => {
    const { canvas, textRendering } = setup();
    textRendering.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, markdownAutoAnchorsEnabled: false });
    await canvas.commands.selection.paste({ eventDataTransfer: clipboard("# No anchor") });
    expect(canvas.documents.getAnchorsAt(canvas.documents.getActiveAddress())).toHaveLength(0);

    textRendering.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "raw" });
    canvas.commands.staticGrid.setActiveCell({ x: 0, y: 5 });
    await canvas.commands.selection.paste({ eventDataTransfer: clipboard("# Still no anchor") });
    expect(canvas.documents.getAnchorsAt(canvas.documents.getActiveAddress())).toHaveLength(0);
  });
});
