import { describe, expect, it } from "vitest";
import {
  createCharDeskRenderModel,
  DEFAULT_CHARDESK_CELL_METRICS,
  formatCharDeskCellFrame,
  getCharDeskFontFamilyForGrapheme,
  resolveCharDeskCellVisual,
  resolveCharDeskFontRoute,
  type CharDeskCellFrameCell,
} from "./index.js";
import type { CellSource } from "@chardesk/cell-core";

describe("CharDesk rendering core", () => {
  it("owns backend-neutral Cell metrics and frame inspection", () => {
    const cells = new Map([["0,0", {
      visual: { text: "界", width: 2 as const, fontRoute: "text" as const },
    }]]);
    const source: CellSource<CharDeskCellFrameCell> = {
      get: ({ x, y }) => cells.get(`${x},${y}`),
      visit: (_bounds, visitor) => cells.forEach((cell) => visitor(0, 0, cell)),
      getContentBounds: () => ({ x: 0, y: 0, width: 2, height: 1 }),
    };
    expect(DEFAULT_CHARDESK_CELL_METRICS).toMatchObject({
      cellWidth: 9,
      cellHeight: 20,
      fontSize: 15,
      baseline: 15,
    });
    expect(formatCharDeskCellFrame({
      revision: 0,
      viewport: { x: 0, y: 0, width: 3, height: 1 },
      source,
      dirty: "full",
    })).toBe("界 ");
  });

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
