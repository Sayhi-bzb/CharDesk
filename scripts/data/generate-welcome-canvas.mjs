import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLOCK_LAYOUT_DASHBOARD_EXAMPLE,
  CHARGRAPH_EXAMPLES,
  getExampleClipboardSource,
  renderExample,
} from "../../packages/chargraph/dist/examples.js";
import { parseCharDeskText } from "../../packages/protocol/dist/index.js";

const verifyOnly = process.argv.includes("--verify");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputPath = path.join(
  repositoryRoot,
  "apps/canvas/src/domains/canvas/state/helpers/default-demo-cases.generated.md"
);

const COLORS = {
  accent: "37;99;235",
  muted: "100;116;139",
};

const style = (text, codes) => `[${codes}m${text}[0m`;
const measurePlain = (text) =>
  parseCharDeskText(text, { syntax: "plain" }).width;
const measureProtocol = (text) => parseCharDeskText(text).width;
const toBlock = (lines) => ({
  lines,
  width: lines.reduce(
    (widest, line) => Math.max(widest, measureProtocol(line)),
    0
  ),
  height: lines.length,
});

const wrapRoundedBox = (block) => {
  const borderStyle = `38;2;${COLORS.muted}`;
  const horizontalBorder = "─".repeat(block.width + 2);
  const lines = [style(`╭${horizontalBorder}╮`, borderStyle)];

  for (const line of block.lines) {
    const padding = " ".repeat(
      Math.max(0, block.width - measureProtocol(line))
    );
    lines.push(
      `${style("│", borderStyle)} ${line}${padding} ${style("│", borderStyle)}`
    );
  }

  lines.push(style(`╰${horizontalBorder}╯`, borderStyle));
  return toBlock(lines);
};

const toEscLessProtocol = (text) =>
  text
    .replaceAll("\u001b[", "[")
    .replaceAll("\u001b]8;;", "]8;;")
    .replaceAll("\u001b\\", "\\");

const renderHorizontalCase = (example, sourceLines, outputLines, index) => {
  const sourceWidth = sourceLines.reduce(
    (widest, line) => Math.max(widest, measurePlain(line)),
    0
  );
  const outputColumn = sourceWidth + 8;
  const bodyHeight = Math.max(sourceLines.length, outputLines.length);
  const lines = [
    style(
      `${String(index + 1).padStart(2, "0")}  ${example.title}`,
      `1;38;2;${COLORS.accent}`
    ),
    `${style("Input", `1;38;2;${COLORS.muted}`)}${" ".repeat(outputColumn - 5)}${style("Output", `1;38;2;${COLORS.muted}`)}`,
  ];

  for (let row = 0; row < bodyHeight; row += 1) {
    const sourceLine = sourceLines[row] ?? "";
    const outputLine = outputLines[row] ?? "";
    const styledSource = sourceLine
      ? style(sourceLine, `38;2;${COLORS.muted}`)
      : "";
    const padding = " ".repeat(
      Math.max(0, outputColumn - measurePlain(sourceLine))
    );
    lines.push(`${styledSource}${padding}${outputLine}`.trimEnd());
  }

  return toBlock(lines);
};

const renderVerticalCase = (example, sourceLines, outputLines, index) =>
  toBlock([
    style(
      `${String(index + 1).padStart(2, "0")}  ${example.title}`,
      `1;38;2;${COLORS.accent}`
    ),
    style("Input", `1;38;2;${COLORS.muted}`),
    ...sourceLines.map((line) =>
      line ? style(line, `38;2;${COLORS.muted}`) : ""
    ),
    "",
    style("Output", `1;38;2;${COLORS.muted}`),
    ...outputLines,
  ]);

const renderCase = async (example, index) => {
  const sourceLines = getExampleClipboardSource(example).split("\n");
  const rendered = await renderExample(example);
  const outputLines = toEscLessProtocol(rendered.protocolText).split("\n");
  const content =
    example.renderer === "mermaid"
      ? renderHorizontalCase(example, sourceLines, outputLines, index)
      : renderVerticalCase(example, sourceLines, outputLines, index);
  return wrapRoundedBox(content);
};

const composeGrid = (blocks, columns, columnGap = 8, rowGap = 3) => {
  const columnWidths = Array.from({ length: columns }, () => 0);
  for (const [index, block] of blocks.entries()) {
    const column = index % columns;
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, block.width);
  }

  const columnOffsets = columnWidths.map((_, column) =>
    columnWidths
      .slice(0, column)
      .reduce((offset, width) => offset + width + columnGap, 0)
  );
  const lines = [];
  const rowCount = Math.ceil(blocks.length / columns);

  for (let gridRow = 0; gridRow < rowCount; gridRow += 1) {
    const rowBlocks = blocks.slice(
      gridRow * columns,
      gridRow * columns + columns
    );
    const rowHeight = rowBlocks.reduce(
      (tallest, block) => Math.max(tallest, block.height),
      0
    );

    for (let lineIndex = 0; lineIndex < rowHeight; lineIndex += 1) {
      let line = "";
      for (const [column, block] of rowBlocks.entries()) {
        const blockLine = block.lines[lineIndex] ?? "";
        const offset = columnOffsets[column] ?? 0;
        line += " ".repeat(Math.max(0, offset - measureProtocol(line)));
        line += blockLine;
      }
      lines.push(line.trimEnd());
    }

    if (gridRow < rowCount - 1) {
      lines.push(...Array.from({ length: rowGap }, () => ""));
    }
  }

  return toBlock(lines);
};

const generate = async () => {
  const examples = CHARGRAPH_EXAMPLES.filter(
    (example) => example.level === "basic"
  );
  const kinds = new Set(examples.map((example) => example.kind));
  if (examples.length !== 11 || kinds.size !== 11) {
    throw new Error(
      `Welcome Canvas requires one basic example for each of 11 kinds; received ${examples.length} examples across ${kinds.size} kinds.`
    );
  }

  const cases = await Promise.all(
    examples.map((example, index) => renderCase(example, index))
  );
  const diagramCases = cases.filter(
    (_, index) => examples[index]?.renderer === "mermaid"
  );
  const markdownCases = cases.filter(
    (_, index) => examples[index]?.renderer === "markdown"
  );
  if (diagramCases.length !== 6 || markdownCases.length !== 5) {
    throw new Error(
      `Welcome Canvas requires 6 Mermaid and 5 Markdown basic examples; received ${diagramCases.length} and ${markdownCases.length}.`
    );
  }
  const diagrams = composeGrid(diagramCases, 2);
  const markdown = composeGrid(markdownCases, 3);
  const dashboard = await renderExample(BLOCK_LAYOUT_DASHBOARD_EXAMPLE);
  const dashboardLines = toEscLessProtocol(dashboard.protocolText).split("\n");
  const caseLayout = [
    ...diagrams.lines,
    "",
    "",
    "",
    "",
    ...markdown.lines,
    "",
    "",
    "",
    "",
    ...dashboardLines,
  ];

  return [
    "<!-- Generated by scripts/data/generate-welcome-canvas.mjs. -->",
    "<!-- Run `npm run welcome:generate` after changing CharGraph examples. -->",
    "",
    "````ascii",
    style("CharGraph · Input → Output", `1;38;2;${COLORS.accent}`),
    style(
      "Paste the complete Input into Canvas / 粘贴左侧输入，生成右侧可编辑字符。",
      `38;2;${COLORS.muted}`
    ),
    "",
    ...caseLayout,
    "````",
    "",
  ].join("\n");
};

const expected = await generate();
if (verifyOnly) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== expected) {
    throw new Error(
      "Welcome Canvas asset is stale. Run `npm run welcome:generate`."
    );
  }
} else {
  await writeFile(outputPath, expected);
}
