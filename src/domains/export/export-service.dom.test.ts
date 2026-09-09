import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverExportClipboard,
  prepareTextExport,
  type ExportContext,
} from "@/domains/export/public";
import { ExportPipelineError } from "./core/types";
import { clipboard } from "@/shared/services/effects";
import {
  parseDocumentSessionSource,
} from "@/domains/document/public";
import { createGridSurfaceReader } from "@/domains/canvas/public";

const createContext = (
  overrides: Partial<ExportContext> = {}
): ExportContext => ({
  canvasMode: "freeform",
  surface: createGridSurfaceReader(
    new Map([["0,0", { char: "A", color: "#ffffff" }]])
  ),
  includeColor: true,
  showGrid: false,
  ...overrides,
});

describe("export service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds a round-trippable CharDesk text artifact", async () => {
    const result = prepareTextExport(createContext(), "chardesk");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      kind: "text",
      format: "chardesk",
      mimeType: "text/plain;charset=utf-8",
    });
    expect(result.value.filename).toMatch(/^chardesk-\d+\.chardesk$/);
    expect(result.value.content).not.toContain("\u001b");
    expect(result.value.content).toContain("chardesk: document/v1");
    expect(result.value.content).toContain("mode: freeform");
    const snapshot = await parseDocumentSessionSource(result.value.content);
    expect(snapshot).toMatchObject({
      mode: "freeform",
      grid: [["0,0", { char: "A", color: "#ffffff" }]],
    });
  });

  it("builds text artifacts with stable metadata", () => {
    const result = prepareTextExport(createContext(), "txt");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      kind: "text",
      format: "txt",
      mimeType: "text/plain;charset=utf-8",
    });
    expect(result.value.content).toContain("A");
    expect(result.value.filename).toMatch(/^chardesk-\d+\.txt$/);
  });

  it("round-trips positioned ANSI slide content through a CharDesk document", async () => {
    const result = prepareTextExport(
      createContext({
        canvasMode: "slide",
        surface: createGridSurfaceReader(new Map()),
        slideDeck: {
          activeSlideId: "slide-1",
          slides: [
            {
              id: "slide-1",
              name: "Intro",
              size: { columns: 6, rows: 3 },
              grid: [["2,1", { char: "R", color: "#ff0000" }]],
            },
          ],
        },
        documentName: "Agent Deck",
      }),
      "chardesk"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      format: "chardesk",
      mimeType: "text/plain;charset=utf-8",
    });
    expect(result.value.filename).toMatch(/^chardesk-\d+\.chardesk$/);
    expect(result.value.content).not.toContain("\u001b");
    expect(result.value.content).toContain("chardesk: document/v1");
    expect(result.value.content).toContain("mode: slide");
    expect(result.value.content).toContain("```chardesk size=6x3");

    const parsed = await parseDocumentSessionSource(result.value.content);
    expect(parsed.name).toBe("Agent Deck");
    expect(parsed.mode).toBe("slide");
    if (parsed.mode !== "slide") return;
    expect(parsed.slideDeck.slides[0].grid).toEqual([
      ["2,1", { char: "R", color: "#ff0000" }],
    ]);
  });

  it("omits the default slide size while preserving custom sizes", async () => {
    const result = prepareTextExport(
      createContext({
        canvasMode: "slide",
        surface: createGridSurfaceReader(new Map()),
        slideDeck: {
          activeSlideId: "slide-1",
          slides: [
            {
              id: "slide-1",
              name: "Default",
              size: { columns: 100, rows: 27 },
              grid: [["0,0", { char: "A", color: "#ffffff" }]],
            },
            {
              id: "slide-2",
              name: "Custom",
              size: { columns: 80, rows: 24 },
              grid: [["0,0", { char: "B", color: "#ffffff" }]],
            },
          ],
        },
      }),
      "chardesk"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toContain("## Default\n\n```chardesk\n");
    expect(result.value.content).toContain("## Custom\n\n```chardesk size=80x24\n");

    const parsed = await parseDocumentSessionSource(result.value.content);
    expect(parsed.mode).toBe("slide");
    if (parsed.mode !== "slide") return;
    expect(parsed.slideDeck.slides.map((slide) => slide.size)).toEqual([
      { columns: 100, rows: 27 },
      { columns: 80, rows: 24 },
    ]);
  });

  it("returns a typed clipboard error instead of throwing", async () => {
    vi.spyOn(clipboard, "writeText").mockResolvedValue(false);
    const artifact = prepareTextExport(createContext(), "txt");
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) return;

    await expect(deliverExportClipboard(artifact.value)).resolves.toEqual({
      ok: false,
      error: { code: "clipboard-write-failed" },
    });
  });

  it("starts a PNG clipboard write before its Blob promise settles", async () => {
    let clipboardData: Record<string, Blob | Promise<Blob> | string> = {};
    class ClipboardItemMock {
      constructor(data: Record<string, Blob | Promise<Blob> | string>) {
        clipboardData = data;
      }
    }
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);

    let resolveBlob!: (blob: Blob) => void;
    const content = new Promise<Blob>((resolve) => {
      resolveBlob = resolve;
    });
    const writeItems = vi.spyOn(clipboard, "writeItemsResult").mockImplementation(
      async () => {
        await clipboardData["image/png"];
        return { ok: true as const };
      }
    );

    const delivery = deliverExportClipboard({
      kind: "blob",
      format: "png",
      filename: "snapshot.png",
      mimeType: "image/png",
      content,
    });

    expect(writeItems).toHaveBeenCalledOnce();
    expect(clipboardData["image/png"]).toBeInstanceOf(Promise);

    resolveBlob(new Blob(["png"], { type: "image/png" }));
    await expect(delivery).resolves.toEqual({ ok: true, value: true });
  });

  it("preserves a raster failure through the Clipboard promise", async () => {
    let clipboardData: Record<string, Promise<Blob>> = {};
    class ClipboardItemMock {
      constructor(data: Record<string, Promise<Blob>>) {
        clipboardData = data;
      }
    }
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    vi.spyOn(clipboard, "writeItemsResult").mockImplementation(async () => {
      try {
        await clipboardData["image/png"];
        return { ok: true as const };
      } catch (cause) {
        return { ok: false as const, cause };
      }
    });

    const result = await deliverExportClipboard({
      kind: "blob",
      format: "png",
      filename: "snapshot.png",
      mimeType: "image/png",
      content: Promise.reject(new ExportPipelineError("image-too-large")),
    });

    expect(result).toEqual({ ok: false, error: { code: "image-too-large" } });
  });
});
