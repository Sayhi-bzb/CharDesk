import { describe, expect, it } from "vitest";
import { parseDocumentSessionSource } from "@/domains/document/public";

describe("CharDesk canvas text", () => {
  it("imports a canonical freeform document without rendering its envelope", async () => {
    const snapshot = await parseDocumentSessionSource([
      "---",
      "chardesk: document/v1",
      "mode: freeform",
      "title: Board",
      "---",
      "[31mA[0m",
    ].join("\n"));

    expect(snapshot).toMatchObject({
      mode: "freeform",
      name: "Board",
      grid: [["0,0", { char: "A", color: "#800000" }]],
    });
  });

  it("flattens a canonical legacy Structured document into Freeform cells", async () => {
    const snapshot = await parseDocumentSessionSource([
      "---",
      "chardesk: document/v1",
      "mode: structured",
      "title: Diagram",
      "---",
      JSON.stringify({
        scene: [{
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 2 },
          style: { color: "#ff0000" },
        }],
        components: [],
      }),
    ].join("\n"));

    expect(snapshot).toMatchObject({ mode: "freeform", name: "Diagram" });
    expect(snapshot).not.toHaveProperty("scene");
    if (snapshot.mode !== "freeform") throw new Error("Expected Freeform migration");
    expect(snapshot.grid.length).toBeGreaterThan(0);
    expect(snapshot.grid.map(([, cell]) => cell.char)).toContain("╭");
  });

  it("rejects broken structured references", async () => {
    await expect(parseDocumentSessionSource([
      "---",
      "chardesk: document/v1",
      "mode: structured",
      "---",
      JSON.stringify({
        scene: [],
        components: [{
          id: "component-1",
          templateId: "card",
          label: "Card",
          atomIds: ["missing"],
          roles: {},
        }],
      }),
    ].join("\n"))).rejects.toThrow("references a missing node");
  });

  it("imports visible ESC-less ANSI as a freeform canvas", async () => {
    const snapshot = await parseDocumentSessionSource(
      "[1;38;2;255;0;0mA界[0m\n]8;;https://example.com\\B]8;;\\"
    );

    expect(snapshot.mode).toBe("freeform");
    if (snapshot.mode !== "freeform") return;
    expect(snapshot.grid).toEqual([
      ["0,0", { char: "A", color: "#ff0000", attrs: { bold: true } }],
      ["1,0", { char: "界", color: "#ff0000", attrs: { bold: true } }],
      ["0,1", { char: "B", color: "#000000", href: "https://example.com" }],
    ]);
  });

  it("imports unstyled Unicode with inherited defaults", async () => {
    const snapshot = await parseDocumentSessionSource("人🙂");
    expect(snapshot).toMatchObject({
      mode: "freeform",
      grid: [
        ["0,0", { char: "人", color: "#000000" }],
        ["2,0", { char: "🙂", color: "#000000" }],
      ],
    });
  });

  it("rejects invisible escapes, malformed controls, and legacy JSON", async () => {
    await expect(parseDocumentSessionSource("\u001b[31mA\u001b[0m")).rejects.toThrow(
      "visible ESC-less ANSI"
    );
    await expect(parseDocumentSessionSource("A\u0001B")).rejects.toThrow(
      "malformed or unsupported controls"
    );
    await expect(parseDocumentSessionSource(
      '{"type":"chardesk-document","version":1,"mode":"freeform","cells":[]}'
    )).rejects.toThrow("Legacy JSON");
  });

  it("uses the source extension to select CharGraph or literal text", async () => {
    const markdown = await parseDocumentSessionSource("**B**", { sourceName: "note.md" });
    const text = await parseDocumentSessionSource("**B**", { sourceName: "note.txt" });

    expect(markdown.mode === "freeform" && markdown.grid.map(([, cell]) => cell.char).join(""))
      .toBe("B");
    expect(text.mode === "freeform" && text.grid.map(([, cell]) => cell.char).join(""))
      .toBe("**B**");
  });
});
