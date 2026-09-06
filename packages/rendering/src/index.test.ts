import { describe, expect, it } from "vitest";
import {
  createCharDeskRenderModel,
  getCharDeskFontFamilyForGrapheme,
  resolveCharDeskCellVisual,
  resolveCharDeskFontRoute,
} from "./index.js";

describe("CharDesk rendering core", () => {
  it("routes complete graphemes through the shared font profile", () => {
    expect(resolveCharDeskFontRoute("A")).toBe("text");
    expect(resolveCharDeskFontRoute("╭")).toBe("text");
    expect(resolveCharDeskFontRoute("♥")).toBe("text");
    expect(resolveCharDeskFontRoute("♥️")).toBe("emoji");
    expect(resolveCharDeskFontRoute("🇨🇳")).toBe("emoji");
    expect(resolveCharDeskFontRoute("1️⃣")).toBe("emoji");
    expect(resolveCharDeskFontRoute("👩🏽‍💻")).toBe("emoji");
    expect(getCharDeskFontFamilyForGrapheme("A")).toContain("ui-monospace");
    expect(getCharDeskFontFamilyForGrapheme("🙂")).toMatch(/^'Noto Emoji'/);
  });

  it("resolves geometry and font route as one cell visual", () => {
    expect(resolveCharDeskCellVisual({ text: "界", color: "#123456" }))
      .toEqual({
        text: "界",
        color: "#123456",
        width: 2,
        fontRoute: "text",
      });
    expect(resolveCharDeskCellVisual({ text: "🙂" })).toEqual({
      text: "🙂",
      width: 2,
      fontRoute: "emoji",
    });
  });

  it("builds renderer-neutral rows from protocol cells", () => {
    const model = createCharDeskRenderModel("A界🙂\n[1m♥️[0m");

    expect(model.document).toMatchObject({ width: 5, height: 2 });
    expect(model.cells.map(({ text, width, fontRoute }) => ({
      text,
      width,
      fontRoute,
    }))).toEqual([
      { text: "A", width: 1, fontRoute: "text" },
      { text: "界", width: 2, fontRoute: "text" },
      { text: "🙂", width: 2, fontRoute: "emoji" },
      { text: "♥️", width: 2, fontRoute: "emoji" },
    ]);
    expect(model.rows[0]?.runs[0]?.segments).toEqual([
      { text: "A", columns: 1, fontRoute: "text" },
      { text: "界", columns: 2, fontRoute: "text" },
      { text: "🙂", columns: 2, fontRoute: "emoji" },
    ]);
  });

  it("keeps the Korean class diagram on one shared cell grid", () => {
    const source = [
      "╭───────────────╮",
      "│ 문서          │",
      "├───────────────┤",
      "│ +제목: string │",
      "├───────────────┤",
      "│ +저장()       │",
      "╰───────────────╯",
      "        ^        ",
      "        │        ",
      "        │        ",
      "   ╭────┴───╮    ",
      "   │ 캔버스 │    ",
      "   ╰────────╯    ",
    ].join("\n");
    const model = createCharDeskRenderModel(source);

    expect(model.document).toMatchObject({ width: 17, height: 13 });
    expect(
      model.rows.map((row) =>
        row.runs.reduce(
          (rowWidth, run) =>
            rowWidth +
            (run.segments?.reduce(
              (runWidth, segment) => runWidth + segment.columns,
              0
            ) ?? 0),
          0
        )
      )
    ).toEqual(new Array(13).fill(17));
  });
});
