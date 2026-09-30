import { formatCharDeskStyleNotes, type ParsedCharDeskText } from "@chardesk/protocol";

export type CharDeskInspectRegion = {
  x: number;
  y: number;
  columns: number;
  rows: number;
};

type CharDeskInspectProjection = {
  text: string;
  styleText?: string;
  view: CharDeskInspectRegion;
  omitted: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

const DEFAULT_COLUMNS = 96;
const DEFAULT_ROWS = 32;

const snapHorizontalBounds = (
  document: ParsedCharDeskText,
  start: number,
  end: number,
) => {
  let snappedStart = start;
  let snappedEnd = end;
  for (const cell of document.cells) {
    const cellEnd = cell.x + cell.width;
    if (cell.x < snappedStart && cellEnd > snappedStart) snappedStart = cell.x;
    if (cell.x < snappedEnd && cellEnd > snappedEnd) snappedEnd = cellEnd;
  }
  return {
    start: Math.max(0, snappedStart),
    end: Math.min(document.width, snappedEnd),
  };
};

const resolveView = (
  document: ParsedCharDeskText,
  requested?: CharDeskInspectRegion,
): CharDeskInspectRegion => {
  const base = requested ?? {
    x: 0,
    y: 0,
    columns: Math.min(document.width, DEFAULT_COLUMNS),
    rows: Math.min(document.height, DEFAULT_ROWS),
  };
  const endX = Math.min(document.width, base.x + base.columns);
  const endY = Math.min(document.height, base.y + base.rows);
  const horizontal = snapHorizontalBounds(document, base.x, endX);
  return {
    x: horizontal.start,
    y: base.y,
    columns: horizontal.end - horizontal.start,
    rows: endY - base.y,
  };
};

const ruler = (start: number, columns: number) => {
  const labels = Array.from({ length: columns }, () => " ");
  const firstTick = Math.ceil(start / 10) * 10;
  for (let coordinate = firstTick; coordinate < start + columns; coordinate += 10) {
    const offset = coordinate - start;
    for (const [index, character] of [...String(coordinate)].entries()) {
      if (offset + index < labels.length) labels[offset + index] = character;
    }
  }
  const digits = Array.from(
    { length: columns },
    (_, offset) => String((start + offset) % 10),
  ).join("");
  return { labels: labels.join("").trimEnd(), digits };
};

const projectRow = (
  document: ParsedCharDeskText,
  y: number,
  start: number,
  end: number,
) => {
  const cells = document.cells
    .filter((cell) => cell.y === y && cell.x >= start && cell.x + cell.width <= end)
    .sort((left, right) => left.x - right.x);
  let cursor = start;
  let output = "";
  for (const cell of cells) {
    if (cell.x > cursor) output += " ".repeat(cell.x - cursor);
    output += cell.text;
    cursor = cell.x + cell.width;
  }
  return output.trimEnd();
};

export const projectCharDeskInspect = (
  document: ParsedCharDeskText,
  options: {
    region?: CharDeskInspectRegion;
    ruler?: boolean;
    styles?: boolean;
  } = {},
): CharDeskInspectProjection => {
  const view = resolveView(document, options.region);
  const endX = view.x + view.columns;
  const endY = view.y + view.rows;
  const rowLabelWidth = String(Math.max(view.y, endY - 1)).length;
  const lines: string[] = [];
  const visibleCells = document.cells
    .filter((cell) => (
      cell.y >= view.y
      && cell.y < endY
      && cell.x >= view.x
      && cell.x + cell.width <= endX
    ));

  if (options.ruler !== false) {
    const horizontal = ruler(view.x, view.columns);
    const indent = " ".repeat(rowLabelWidth + 3);
    lines.push(`${indent}${horizontal.labels}`, `${indent}${horizontal.digits}`);
  }
  for (let y = view.y; y < endY; y += 1) {
    const content = projectRow(document, y, view.x, endX);
    lines.push(options.ruler === false
      ? content
      : `${String(y).padStart(rowLabelWidth)} │ ${content}`.trimEnd());
  }

  return {
    text: lines.join("\n"),
    ...(options.styles ? { styleText: formatCharDeskStyleNotes(visibleCells, { truncationHint: "narrow --region" }) } : {}),
    view,
    omitted: {
      left: view.x,
      right: document.width - endX,
      top: view.y,
      bottom: document.height - endY,
    },
  };
};
