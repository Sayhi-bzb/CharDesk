import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_GRID,
  buildDefaultDemoGrid,
  extractAsciiCodeBlocks,
} from "@/domains/canvas/state/helpers/defaultDemo";
import {
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_NAME,
  DEFAULT_STRUCTURED_SESSION_ID,
} from "@/domains/canvas/state/helpers/storeUtils";
import {
  defaultCanvasDocuments,
  useEditorStore,
} from "@/domains/canvas/testing";
import { GridManager } from "@/shared/utils/grid";
import type { GridCell } from "@/shared/types";
import generatedCasesMarkdown from "@/domains/canvas/state/helpers/default-demo-cases.generated.md?raw";
import demoMarkdown from "@/domains/canvas/state/helpers/default-demo.md?raw";
import { parseCharDeskText } from "@chardesk/protocol";

const findTextPosition = (
  grid: readonly [string, GridCell][],
  text: string,
  startY = 0
) => {
  const cells = new Map(grid);
  const coordinates = grid.map(([key]) => GridManager.fromKey(key));
  const maxY = coordinates.reduce((maximum, point) =>
    Math.max(maximum, point.y), 0);

  for (let y = startY; y <= maxY; y += 1) {
    const maxX = coordinates
      .filter((point) => point.y === y)
      .reduce((maximum, point) => Math.max(maximum, point.x), 0);
    const line = Array.from(
      { length: maxX + 1 },
      (_, x) => cells.get(GridManager.toKey(x, y))?.char ?? " "
    ).join("");
    const x = line.indexOf(text);
    if (x >= 0) return { x, y };
  }

  return undefined;
};

describe("default demo canvas", () => {
  it("extracts only ascii fenced blocks from markdown", () => {
    expect(
      extractAsciiCodeBlocks(
        [
          "# Heading",
          "```ascii",
          "[38;2;255;0;0mA[0m",
          "```",
          "```text",
          "ignored",
          "```",
          "```ascii",
          "B",
          "```",
        ].join("\n")
      )
    ).toEqual(["[38;2;255;0;0mA[0m", "B"]);
  });

  it("allows complete fenced inputs inside a longer ascii fence", () => {
    expect(
      extractAsciiCodeBlocks(
        [
          "````ascii",
          "```mermaid",
          "flowchart LR",
          "```",
          "````",
        ].join("\n")
      )
    ).toEqual(["```mermaid\nflowchart LR\n```"]);
  });

  it("separates generated cases with whitespace instead of divider rows", () => {
    expect(generatedCasesMarkdown).not.toContain("38;2;203;213;225");
    expect(generatedCasesMarkdown).not.toMatch(/^─{20,}$/m);
  });

  it("wraps every generated case in an independent rounded box", () => {
    const mutedTopBorders = generatedCasesMarkdown.match(
      /\[38;2;100;116;139m╭/g
    );
    const mutedBottomBorders = generatedCasesMarkdown.match(
      /\[38;2;100;116;139m╰/g
    );

    expect(mutedTopBorders).toHaveLength(11);
    expect(mutedBottomBorders).toHaveLength(11);
  });

  it("lays out Mermaid horizontally and Markdown vertically in two dimensions", () => {
    const [content] = extractAsciiCodeBlocks(generatedCasesMarkdown);
    expect(content).toBeDefined();
    const lines = parseCharDeskText(content!).plainText.split("\n");
    const lineOf = (text: string) =>
      lines.findIndex((line) => line.includes(text));

    expect(lineOf("01  Input Validation")).toBe(lineOf("02  Document Review"));
    expect(lineOf("03  Request Flow")).toBeGreaterThan(
      lineOf("01  Input Validation")
    );
    expect(lineOf("07  Markdown Basics")).toBe(lineOf("08  Task List"));
    expect(lineOf("08  Task List")).toBe(lineOf("09  Code Block"));
    expect(lineOf("10  Notes & Tips")).toBeGreaterThan(
      lineOf("07  Markdown Basics")
    );

    const mermaidLabels = lines[lineOf("01  Input Validation") + 1] ?? "";
    expect(mermaidLabels).toContain("Input");
    expect(mermaidLabels).toContain("Output");

    const markdownStart = lineOf("07  Markdown Basics");
    const markdownNextRow = lineOf("10  Notes & Tips");
    const markdownLabels = lines[markdownStart + 1] ?? "";
    expect(markdownLabels).toContain("Input");
    expect(markdownLabels).not.toContain("Output");
    expect(
      lines
        .slice(markdownStart + 2, markdownNextRow)
        .some((line) => line.includes("Output"))
    ).toBe(true);
  });

  it("appends the shared block layout dashboard after the case catalog", () => {
    const [content] = extractAsciiCodeBlocks(generatedCasesMarkdown);
    expect(content).toBeDefined();
    const lines = parseCharDeskText(content!).plainText.split("\n");
    const inlineMathRow = lines.findIndex((line) =>
      line.includes("11  Inline Math")
    );
    const dashboardRow = lines.findIndex((line) =>
      line.includes("CharDesk Workspace")
    );

    expect(inlineMathRow).toBeGreaterThanOrEqual(0);
    expect(dashboardRow).toBeGreaterThan(inlineMathRow);
    expect(lines.some((line) => line.includes("All systems operational"))).toBe(
      true
    );
  });

  it("builds a single freeform grid from ascii blocks with spacing between blocks", () => {
    const grid = buildDefaultDemoGrid(
      [
        "```ascii",
        "[38;2;255;0;0mA[0m",
        "```",
        "```ascii",
        "[1;38;2;0;255;0mB[0m",
        "```",
      ].join("\n")
    );

    expect(grid).toEqual([
      ["0,0", { char: "A", color: "#ff0000" }],
      ["0,2", { char: "B", color: "#00ff00", attrs: { bold: true } }],
    ]);
  });

  it("lays out the four visual demos in one horizontal row", () => {
    const blocks = extractAsciiCodeBlocks(demoMarkdown);
    expect(blocks).toHaveLength(4);

    const anchors = [
      "█████████████████████████",
      "Normal visual mode",
      "┌──────────────────────────┐",
      "╭─────────────────────────────╮",
    ].map((text) => findTextPosition(DEFAULT_DEMO_GRID, text));
    expect(anchors.every(Boolean)).toBe(true);
    expect(anchors.map((position) => position!.y)).toEqual([0, 0, 0, 0]);
    expect(anchors.map((position) => position!.x)).toEqual(
      [...anchors.map((position) => position!.x)].sort(
        (left, right) => left - right
      )
    );

    const demoHeight = Math.max(
      ...blocks.map((block) => parseCharDeskText(block).height)
    );
    expect(
      findTextPosition(DEFAULT_DEMO_GRID, "CharGraph · Input → Output")?.y
    ).toBe(demoHeight + 1);
  });

  it("includes clickable repository and CharGraph links in the product demo", () => {
    const productDemo = extractAsciiCodeBlocks(demoMarkdown)[3];
    expect(productDemo).toBeDefined();
    const parsed = parseCharDeskText(productDemo!);
    const hrefs = new Set(parsed.cells.map((cell) => cell.href).filter(Boolean));

    expect(parsed.diagnostics).toEqual([]);
    expect(hrefs).toEqual(
      new Set([
        "https://github.com/Sayhi-bzb/CharDesk",
        "https://chardesk.com/chargraph/",
      ])
    );
    expect(
      productDemo!
        .split("\n")
        .map((line) => parseCharDeskText(line).width)
        .every((width) => width === 31)
    ).toBe(true);
  });

  it("preserves dashboard links in the generated Welcome grid", () => {
    const dashboard = findTextPosition(DEFAULT_DEMO_GRID, "CharDesk Workspace");
    expect(dashboard).toBeDefined();
    const repository = findTextPosition(
      DEFAULT_DEMO_GRID,
      "github.com/Sayhi-bzb/CharDesk",
      dashboard!.y
    );
    const charGraph = findTextPosition(
      DEFAULT_DEMO_GRID,
      "chardesk.com/chargraph",
      dashboard!.y
    );

    expect(repository).toBeDefined();
    expect(charGraph).toBeDefined();
    expect(
      new Map(DEFAULT_DEMO_GRID).get(
        GridManager.toKey(repository!.x, repository!.y)
      )?.href
    ).toBe("https://github.com/Sayhi-bzb/CharDesk");
    expect(
      new Map(DEFAULT_DEMO_GRID).get(
        GridManager.toKey(charGraph!.x, charGraph!.y)
      )?.href
    ).toBe("https://chardesk.com/chargraph/");
  });

  it("uses the visual demos and generated CharGraph cases in Welcome", () => {
    const state = useEditorStore.getState();
    const firstSession = state.canvasSessions.find(
      (session) => session.id === DEFAULT_SESSION_ID
    );

    expect(DEFAULT_DEMO_GRID.length).toBeGreaterThan(0);
    expect(firstSession?.name).toBe(DEFAULT_SESSION_NAME);
    expect(DEFAULT_SESSION_NAME).toBe("Welcome");
    expect(firstSession).not.toHaveProperty("grid");
    expect(state.contentSurface.reader.materialize()).toEqual(new Map(DEFAULT_DEMO_GRID));
    expect(state.contentSurface.reader.materialize().get(GridManager.toKey(1, 0))).toEqual({
      char: "█",
      color: "#f54954",
    });
    const normalMode = findTextPosition(DEFAULT_DEMO_GRID, "Normal visual mode");
    expect(normalMode).toBeDefined();
    expect(
      state.contentSurface.reader.materialize().get(GridManager.toKey(normalMode!.x, normalMode!.y))
    ).toEqual({
      char: "N",
      color: "#2563eb",
      attrs: { bold: true },
    });
    expect(
      Array.from(state.contentSurface.reader.materialize().values())
        .map((cell) => cell.char)
        .join("")
    ).toContain("CharGraph · Input → Output");
    expect(
      Array.from(state.contentSurface.reader.materialize().values()).some(
        (cell) =>
          cell.char === " " && !cell.bgColor && !cell.attrs && !cell.href
      )
    ).toBe(false);
  });

  it("adds a default structured Safari canvas without activating it", () => {
    const state = useEditorStore.getState();
    const structuredSession = state.canvasSessions.find(
      (session) => session.id === DEFAULT_STRUCTURED_SESSION_ID
    );

    expect(state.activeCanvasId).toBe(DEFAULT_SESSION_ID);
    expect(state.canvasMode).toBe("freeform");
    expect(state.canvasSessions).toHaveLength(2);
    expect(structuredSession).toMatchObject({
      id: DEFAULT_STRUCTURED_SESSION_ID,
      name: "Canvas 2",
      mode: "structured",
    });
    const structuredSeed = defaultCanvasDocuments.getDocumentSeed(
      DEFAULT_STRUCTURED_SESSION_ID,
      "structured"
    );
    expect(structuredSession).not.toHaveProperty("scene");
    expect(structuredSeed?.scene.some((node) => node.type === "splitBox")).toBe(
      true
    );
    expect(structuredSeed?.components?.[0]).toMatchObject({
      templateId: "safari",
      label: "Safari",
    });
    expect(structuredSession).not.toHaveProperty("grid");
  });
});
