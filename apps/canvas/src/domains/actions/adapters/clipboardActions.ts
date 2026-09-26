import {
  exportSelectionToAnsi,
  exportSelectionToJSON,
  exportSelectionToString,
  exportToAnsi,
} from "@/domains/export/public";
import {
  forEachGridSelectionSpan,
  getGridSelectionSpans,
} from "@/domains/selection/public";
import { GridManager } from "@/shared/utils/grid";
import { createGridMapSource } from "@/shared/utils/grid-source";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import type {
  GridCellSource,
  GridMap,
  Point,
  SelectionArea,
} from "@/shared/types";
import type { RichTextCell } from "@/domains/canvas/public";
import {
  renderTextSource,
  type CompactTextRenderResult,
  type TextRenderContext,
  type TextRenderResult,
} from "@/domains/document/public";
import { clipboard } from "@/shared/services/effects";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { parseAnsiTextCells } from "@/shared/utils/ansiText";

const MIME_RICH_DATA = "web application/x-ascii-metropolis";
const DEFAULT_ANSI_PASTE_COLOR = "#ffffff";

interface ClipboardPayload {
  plain: string;
  rich: string | null;
}

type ClipboardPayloadFormat = "plain" | "ansi";

const toAnsiLikeClipboardText = (value: string) => value.replaceAll("\u001b[", "[");

/** @deprecated Use the document text-rendering runtime for new clipboard paths. */
export const parseAnsiClipboardText = (
  source: string,
  defaultColor = DEFAULT_ANSI_PASTE_COLOR
) => parseAnsiTextCells(source, defaultColor);

export type RenderClipboardText = (
  source: string,
  defaultColor: string,
  context?: TextRenderContext
) =>
  | TextRenderResult
  | CompactTextRenderResult
  | Promise<TextRenderResult | CompactTextRenderResult>;

const toRenderedClipboardPayload = async (
  source: string,
  defaultColor: string,
  renderText: RenderClipboardText,
  context?: TextRenderContext
) => {
  const rendered = await renderText(source, defaultColor, context);
  if (rendered.kind === "spans") {
    return {
      richRows: rendered.rows,
      richCells: null,
      plainText: source,
      diagnostics: rendered.diagnostics,
    };
  }
  return rendered.kind === "styled"
    ? {
        richCells: rendered.cells,
        plainText: source,
        diagnostics: rendered.diagnostics,
      }
    : {
        richCells: null,
        plainText: rendered.text,
        diagnostics: rendered.diagnostics,
      };
};

export const hasClipboardSource = (
  selections: SelectionArea[],
  textCursor: Point | null
) => {
  return selections.length > 0 || !!textCursor;
};

const projectGridSelection = (
  grid: GridCellSource,
  selections: SelectionArea[],
  brushColor: string
): GridMap => {
  const projection: GridMap = new Map();
  forEachGridSelectionSpan(selections, ({ y, minX, maxX }) => {
    for (let x = minX; x <= maxX; x++) {
      const key = GridManager.toKey(x, y);
      if (resolveGridSlot(grid, { x, y })?.offset === 1) continue;
      projection.set(key, grid.get({ x, y }) ?? { char: " ", color: brushColor });
    }
  }, grid);
  return projection;
};

export const buildClipboardPayload = (
  grid: GridCellSource,
  selections: SelectionArea[],
  textCursor: Point | null,
  brushColor: string,
  format: ClipboardPayloadFormat = "plain"
): ClipboardPayload | null => {
  if (!hasClipboardSource(selections, textCursor)) return null;

  if (selections.length > 0) {
    const effectiveSelections = getGridSelectionSpans(selections, grid).map(
      ({ y, minX, maxX }) => ({
        start: { x: minX, y },
        end: { x: maxX, y },
      })
    );
    const projectedGrid = projectGridSelection(
      grid,
      effectiveSelections,
      brushColor
    );
    const projectedSource = createGridMapSource(projectedGrid);
    return {
      plain:
        format === "ansi"
          ? toAnsiLikeClipboardText(exportSelectionToAnsi(projectedSource, effectiveSelections))
          : exportSelectionToString(projectedSource, effectiveSelections),
      rich:
        format === "ansi"
          ? null
          : exportSelectionToJSON(projectedSource, effectiveSelections),
    };
  }

  if (!textCursor) return null;
  const slot = resolveGridSlot(grid, textCursor);
  const cell = slot?.cell;
  const char = cell?.char || " ";
  const singleCellGrid: GridMap = new Map([
    [
      "0,0",
      {
        char,
        color: cell?.color || brushColor,
        ...(cell?.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cloneTextAttributes(cell?.attrs)
          ? { attrs: cloneTextAttributes(cell?.attrs) }
          : {}),
        ...(cell?.href ? { href: cell.href } : {}),
      },
    ],
  ]);
  return {
    plain:
      format === "ansi"
        ? toAnsiLikeClipboardText(exportToAnsi(createGridMapSource(singleCellGrid)))
        : char,
    rich:
      format === "ansi"
        ? null
        : JSON.stringify({
            type: "ascii-metropolis-zone",
            version: 1,
            cells: [
              {
                x: 0,
                y: 0,
                char,
                color: cell?.color || brushColor,
                ...(cell?.bgColor ? { bgColor: cell.bgColor } : {}),
                ...(cloneTextAttributes(cell?.attrs)
                  ? { attrs: cloneTextAttributes(cell?.attrs) }
                  : {}),
                ...(cell?.href ? { href: cell.href } : {}),
              },
            ],
    }),
  };
};

interface WriteClipboardOptions {
  event?: ClipboardEvent;
  withRich?: boolean;
}

export const writeClipboardPayload = async (
  payload: ClipboardPayload,
  options: WriteClipboardOptions = {}
) => {
  const { event, withRich = false } = options;

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData("text/plain", payload.plain);
    // Include app-native rich data on copy events so in-app paste can
    // reconstruct multi-cell selections while external apps still receive plain text.
    if (payload.rich) {
      event.clipboardData.setData(MIME_RICH_DATA, payload.rich);
    }
    return true;
  }

  try {
    if (
      withRich &&
      payload.rich &&
      typeof ClipboardItem !== "undefined"
    ) {
      const clipboardMap: Record<string, Blob> = {
        "text/plain": new Blob([payload.plain], { type: "text/plain" }),
        [MIME_RICH_DATA]: new Blob([payload.rich], {
          type: MIME_RICH_DATA,
        }),
      };

      const richCopied = await clipboard.writeItems([new ClipboardItem(clipboardMap)]);
      if (richCopied) return true;
      return clipboard.writeText(payload.plain);
    }

    return clipboard.writeText(payload.plain);
  } catch {
    return false;
  }
};

const parseRichClipboardText = (
  rawText: string
): {
  richCells: RichTextCell[] | null;
  plainText: string | null;
} | null => {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText) as {
      type?: string;
      cells?: RichTextCell[];
      surfaceCells?: RichTextCell[];
      structuredText?: { text?: unknown };
    };
    if (parsed.type === "ascii-metropolis-clipboard") {
      const surfaceCells = Array.isArray(parsed.surfaceCells)
        ? parsed.surfaceCells
        : Array.isArray(parsed.cells)
          ? parsed.cells
          : [];
      return {
        richCells: surfaceCells,
        plainText: typeof parsed.structuredText?.text === "string"
          ? parsed.structuredText.text
          : null,
      };
    }
    if (!Array.isArray(parsed.cells)) return null;
    return { richCells: parsed.cells, plainText: null };
  } catch {
    return null;
  }
};

const readRichClipboardCells = async (): Promise<{
  richCells: RichTextCell[] | null;
  plainText: string | null;
} | null> => {
  const items = await clipboard.readItems();
  if (items) {
    for (const item of items) {
      if (!item.types.includes(MIME_RICH_DATA)) continue;
      const blob = await item.getType(MIME_RICH_DATA);
      const parsed = parseRichClipboardText(await blob.text());
      if (parsed) return parsed;
    }
  }

  return null;
};

export const readClipboardPayload = async (
  eventDataTransfer?: DataTransfer,
  defaultColor = DEFAULT_ANSI_PASTE_COLOR,
  renderText: RenderClipboardText = renderTextSource,
  context?: TextRenderContext
) => {
  // ClipboardEvent data is only guaranteed to remain readable while the
  // event is being dispatched. Snapshot every format before the first await.
  const eventRichText = eventDataTransfer?.getData(MIME_RICH_DATA) ?? "";
  const eventPlainText = eventDataTransfer?.getData("text/plain") ?? "";
  const eventRichPayload = parseRichClipboardText(eventRichText);
  if (eventRichPayload) {
    return {
      richCells: eventRichPayload.richCells,
      plainText: eventRichPayload.plainText,
      diagnostics: [],
    };
  }

  if (eventPlainText) {
    return await toRenderedClipboardPayload(
      eventPlainText,
      defaultColor,
      renderText,
      context
    );
  }

  const richPayload = await readRichClipboardCells();
  if (richPayload) {
    return {
      richCells: richPayload.richCells,
      plainText: richPayload.plainText,
      diagnostics: [],
    };
  }

  const text = await clipboard.readText();
  if (text === null) {
    return {
      richCells: null,
      plainText: null,
      diagnostics: [],
      error: "clipboard-failed" as const,
    };
  }
  if (text) {
    return await toRenderedClipboardPayload(text, defaultColor, renderText, context);
  }

  return {
    richCells: null,
    plainText: null,
    diagnostics: [],
  };
};
