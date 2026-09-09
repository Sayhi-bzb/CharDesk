import { layoutCharDeskTextRunsToRows } from "@chardesk/protocol";
import { createCharGraphFragment } from "./fragments.js";
import type {
  CharGraphDiagnostic,
  CharGraphFragment,
  CharGraphInlineAlignment,
  CharGraphRenderResult,
  CharGraphSourceRange,
} from "./model.js";

export type BlockLayoutBlock = {
  source: string;
  range: CharGraphSourceRange;
  /** Lexical form retained only when Markdown needs to distinguish an escaped boundary. */
  protectedSource?: string;
};

export type BlockLayoutDocument = {
  rows: BlockLayoutBlock[][];
};

export type BlockLayoutParseResult = {
  document: BlockLayoutDocument | null;
  recognized: boolean;
  boundaries: {
    fields: number;
    rows: number;
  };
  diagnostics: CharGraphDiagnostic[];
};

export type BlockLayoutRenderOptions = {
  columnGap?: number;
  rowGap?: number;
};

export type BlockLayoutFieldRenderer = (
  block: BlockLayoutBlock
) => Promise<CharGraphRenderResult>;

const NEXT_FIELD = "|||";
const NEXT_ROW = "---";

const classifyControlLine = (line: string) => {
  const trimmed = line.trim();
  if (trimmed === NEXT_FIELD) return "next-field" as const;
  if (trimmed === NEXT_ROW) return "next-row" as const;
  return null;
};

const unescapeControlLine = (line: string) => {
  const match = line.match(/^([ \t]*)(\\+)(\|\|\||---)([ \t]*)$/u);
  if (!match) return line;
  return `${match[1]}${match[2]!.slice(1)}${match[3]}${match[4]}`;
};

const escapeControlLine = (line: string) => {
  const match = line.match(/^([ \t]*)(\\*)(\|\|\||---)([ \t]*)$/u);
  if (!match) return line;
  return `${match[1]}\\${match[2]}${match[3]}${match[4]}`;
};

const scanSourceLines = (source: string) => {
  const lines: { text: string; start: number; next: number }[] = [];
  let start = 0;
  while (start <= source.length) {
    const newline = source.indexOf("\n", start);
    if (newline < 0) {
      const raw = source.slice(start);
      lines.push({
        text: raw.endsWith("\r") ? raw.slice(0, -1) : raw,
        start,
        next: source.length,
      });
      break;
    }
    const raw = source.slice(start, newline);
    lines.push({
      text: raw.endsWith("\r") ? raw.slice(0, -1) : raw,
      start,
      next: newline + 1,
    });
    start = newline + 1;
    if (start === source.length) {
      lines.push({ text: "", start, next: start });
      break;
    }
  }
  return lines;
};

export const parseBlockLayout = (source: string): BlockLayoutParseResult => {
  const rows: BlockLayoutBlock[][] = [[]];
  let blockLines: string[] = [];
  let protectedBlockLines: string[] = [];
  let blockStart = 0;
  let offset = 0;
  let fieldBoundaryCount = 0;
  let rowBoundaryCount = 0;

  const finishBlock = (to: number) => {
    const blockSource = blockLines.join("\n");
    const protectedSource = protectedBlockLines.join("\n");
    rows.at(-1)!.push({
      source: blockSource,
      range: { from: blockStart, to },
      ...(protectedSource === blockSource ? {} : { protectedSource }),
    });
    blockLines = [];
    protectedBlockLines = [];
  };

  scanSourceLines(source).forEach((line) => {
    const direction = classifyControlLine(line.text);
    if (!direction) {
      blockLines.push(unescapeControlLine(line.text));
      protectedBlockLines.push(line.text);
      offset = line.next;
      return;
    }

    if (direction === "next-field") fieldBoundaryCount += 1;
    else rowBoundaryCount += 1;
    finishBlock(offset);
    if (direction === "next-row") rows.push([]);
    blockStart = line.next;
    offset = line.next;
  });

  finishBlock(source.length);
  const boundaries = {
    fields: fieldBoundaryCount,
    rows: rowBoundaryCount,
  };
  if (fieldBoundaryCount + rowBoundaryCount === 0) {
    return { document: null, recognized: false, boundaries, diagnostics: [] };
  }
  return { document: { rows }, recognized: true, boundaries, diagnostics: [] };
};

export const serializeBlockLayout = (document: BlockLayoutDocument) =>
  document.rows
    .map((row) =>
      row
        .map((block) => block.source.split("\n").map(escapeControlLine).join("\n"))
        .join(`\n${NEXT_FIELD}\n`)
    )
    .join(`\n${NEXT_ROW}\n`);

type PlacedSpan = {
  x: number;
  width: number;
  fragment: CharGraphFragment;
};

const normalizeGap = (value: number | undefined, fallback: number) =>
  Number.isInteger(value) && value !== undefined && value >= 0 ? value : fallback;

const resolveInlineInset = (
  alignment: CharGraphInlineAlignment,
  remaining: number
) => {
  if (alignment === "center") return Math.floor(remaining / 2);
  if (alignment === "end") return remaining;
  return 0;
};

const visualGroupInsets = (
  rendered: CharGraphRenderResult,
  rows: ReturnType<typeof layoutCharDeskTextRunsToRows>["rows"],
  fieldWidth: number,
  fieldHeight: number
) => {
  const insets = new Map<number, number>();
  for (const group of rendered.visualGroups ?? []) {
    if (
      !Number.isInteger(group.fromRow) ||
      !Number.isInteger(group.toRow) ||
      group.fromRow < 0 ||
      group.toRow <= group.fromRow ||
      group.toRow > fieldHeight
    ) continue;
    const groupRows = rows.filter(
      (row) => row.y >= group.fromRow && row.y < group.toRow
    );
    const groupWidth = Math.max(
      0,
      ...groupRows.flatMap((row) =>
        row.spans.map((span) => span.x + span.width)
      )
    );
    const inset = resolveInlineInset(
      group.inlineAlignment ?? "start",
      Math.max(0, fieldWidth - groupWidth)
    );
    for (let row = group.fromRow; row < group.toRow; row += 1) {
      insets.set(row, inset);
    }
  }
  return insets;
};

export const renderBlockLayoutDocument = async (
  document: BlockLayoutDocument,
  renderField: BlockLayoutFieldRenderer,
  options: BlockLayoutRenderOptions = {}
): Promise<Pick<CharGraphRenderResult, "fragments" | "diagnostics">> => {
  const columnGap = normalizeGap(options.columnGap, 4);
  const rowGap = normalizeGap(options.rowGap, 1);
  const outputRows = new Map<number, PlacedSpan[]>();
  const diagnostics: CharGraphDiagnostic[] = [];
  let originY = 0;
  let outputHeight = 0;

  for (const layoutRow of document.rows) {
    let originX = 0;
    let layoutRowHeight = 1;
    for (const block of layoutRow) {
      const rendered = await renderField(block);
      const parsed = layoutCharDeskTextRunsToRows(rendered.fragments);
      const groupInsets = visualGroupInsets(
        rendered,
        parsed.rows,
        parsed.width,
        parsed.height
      );
      const blockHeight = Math.max(1, parsed.height);
      layoutRowHeight = Math.max(layoutRowHeight, blockHeight);
      diagnostics.push(
        ...rendered.diagnostics.map((item) => ({
          ...item,
          ...(item.offset === undefined
            ? {}
            : { offset: block.range.from + item.offset }),
        })),
        ...parsed.diagnostics.map((item) => ({
          ...item,
          code: `block-layout.protocol.${item.code}`,
          offset: block.range.from + item.offset,
        }))
      );

      for (const row of parsed.rows) {
        const targetY = originY + row.y;
        const target = outputRows.get(targetY) ?? [];
        for (const span of row.spans) {
          target.push({
            x: originX + (groupInsets.get(row.y) ?? 0) + span.x,
            width: span.width,
            fragment: createCharGraphFragment(
              span.text,
              span,
              span.text.length > 0 ? block.range : undefined,
              span.href
            ),
          });
        }
        outputRows.set(targetY, target);
      }
      originX += parsed.width + columnGap;
    }
    outputHeight = Math.max(outputHeight, originY + layoutRowHeight);
    originY += layoutRowHeight + rowGap;
  }

  const fragments: CharGraphFragment[] = [];
  for (let y = 0; y < outputHeight; y += 1) {
    const spans = [...(outputRows.get(y) ?? [])].sort((left, right) => left.x - right.x);
    let cursorX = 0;
    for (const span of spans) {
      if (span.x > cursorX) {
        fragments.push(createCharGraphFragment(" ".repeat(span.x - cursorX)));
      }
      fragments.push(span.fragment);
      cursorX = Math.max(cursorX, span.x + span.width);
    }
    if (y < outputHeight - 1) fragments.push(createCharGraphFragment("\n"));
  }

  return { fragments, diagnostics };
};
