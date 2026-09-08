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
  NodeBounds,
  Point,
  SelectionArea,
} from "@/shared/types";
import type { StructuredNode, StructuredNodeStyle, StructuredTextNode, StructuredTextStyleRange } from "@/domains/structured-content/public";
import type { RichTextCell } from "@/domains/canvas/public";
import {
  renderTextSource,
  type CompactTextRenderResult,
  type TextRenderResult,
} from "@/domains/document/public";
import { clipboard } from "@/shared/services/effects";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { parseAnsiTextCells } from "@/shared/utils/ansiText";
import {
  buildStructuredTree,
  getStructuredNodeBounds,
  renderStructuredScene,
} from "@/domains/structured-content/public";
import {
  decodeStructuredNode,
  getStructuredTextSlice,
  getStructuredTextStyleRangesInRange,
} from "@/domains/structured-content/public";

const MIME_RICH_DATA = "web application/x-ascii-metropolis";
const DEFAULT_ANSI_PASTE_COLOR = "#ffffff";

interface ClipboardPayload {
  plain: string;
  rich: string | null;
}

type ClipboardPayloadFormat = "plain" | "ansi";

interface StructuredClipboardData {
  structuredNodes: StructuredNode[];
  surfaceCells: RichTextCell[];
  bounds: NodeBounds;
}

interface StructuredTextClipboardData {
  text: string;
  style: StructuredNodeStyle;
  styleRanges?: StructuredTextStyleRange[];
}

interface StructuredClipboardPayload {
  type: "ascii-metropolis-clipboard";
  version: 2;
  cells: RichTextCell[];
  surfaceCells: RichTextCell[];
  structuredNodes: StructuredNode[];
  bounds: NodeBounds;
  structuredText?: StructuredTextClipboardData;
}

const toAnsiLikeClipboardText = (value: string) => value.replaceAll("\u001b[", "[");

const cloneStructuredNodeStyle = (
  style: StructuredNodeStyle
): StructuredNodeStyle => ({
  color: style.color,
  ...(style.bgColor ? { bgColor: style.bgColor } : {}),
  ...(cloneTextAttributes(style.attrs)
    ? { attrs: cloneTextAttributes(style.attrs) }
    : {}),
});

/** @deprecated Use the document text-rendering runtime for new clipboard paths. */
export const parseAnsiClipboardText = (
  source: string,
  defaultColor = DEFAULT_ANSI_PASTE_COLOR
) => parseAnsiTextCells(source, defaultColor);

export type RenderClipboardText = (
  source: string,
  defaultColor: string
) =>
  | TextRenderResult
  | CompactTextRenderResult
  | Promise<TextRenderResult | CompactTextRenderResult>;

const toRenderedClipboardPayload = async (
  source: string,
  defaultColor: string,
  renderText: RenderClipboardText
) => {
  const rendered = await renderText(source, defaultColor);
  if (rendered.kind === "spans") {
    return {
      richRows: rendered.rows,
      richCells: null,
      structured: null,
      structuredText: null,
      plainText: source,
      diagnostics: rendered.diagnostics,
    };
  }
  return rendered.kind === "styled"
    ? {
        richCells: rendered.cells,
        structured: null,
        structuredText: null,
        plainText: source,
        diagnostics: rendered.diagnostics,
      }
    : {
        richCells: null,
        structured: null,
        structuredText: null,
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

const getSceneBounds = (scene: StructuredNode[]): NodeBounds | null => {
  if (scene.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  scene.forEach((node) => {
    const bounds = getStructuredNodeBounds(node);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width - 1);
    maxY = Math.max(maxY, bounds.y + bounds.height - 1);
  });
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

const collectStructuredSubtreeIds = (
  node: StructuredNode,
  childrenById: Map<string, StructuredNode[]>,
  out: Set<string>
) => {
  if (out.has(node.id)) return;
  out.add(node.id);
  const children = childrenById.get(node.id) || [];
  children.forEach((child) => collectStructuredSubtreeIds(child, childrenById, out));
};

export const selectStructuredClipboardNodes = (
  scene: StructuredNode[],
  selectedNodeIds: string[]
) => {
  if (selectedNodeIds.length === 0) {
    return [...scene].sort((a, b) => a.order - b.order);
  }

  const selectedIds = new Set(selectedNodeIds);
  const { roots, childrenById } = buildStructuredTree(scene);
  const includedIds = new Set<string>();

  const visit = (node: StructuredNode, hasSelectedAncestor: boolean) => {
    const isSelected = selectedIds.has(node.id);
    if (isSelected && !hasSelectedAncestor) {
      collectStructuredSubtreeIds(node, childrenById, includedIds);
      return;
    }
    const children = childrenById.get(node.id) || [];
    children.forEach((child) => visit(child, hasSelectedAncestor || isSelected));
  };

  roots.forEach((root) => visit(root, false));
  return scene
    .filter((node) => includedIds.has(node.id))
    .sort((a, b) => a.order - b.order);
};

const structuredSurfaceCellsFromScene = (
  scene: StructuredNode[],
  bounds: NodeBounds
): RichTextCell[] => {
  return Array.from(renderStructuredScene(scene).entries())
    .map(([key, cell]) => {
      const { x, y } = GridManager.fromKey(key);
      return {
        x: x - bounds.x,
        y: y - bounds.y,
        char: cell.char,
        color: cell.color,
        ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cloneTextAttributes(cell.attrs)
          ? { attrs: cloneTextAttributes(cell.attrs) }
          : {}),
        ...(cell.href ? { href: cell.href } : {}),
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
};

export const buildStructuredClipboardPayload = (
  scene: StructuredNode[],
  selectedNodeIds: string[] = []
): ClipboardPayload | null => {
  const structuredNodes = selectStructuredClipboardNodes(scene, selectedNodeIds);
  const bounds = getSceneBounds(structuredNodes);
  if (!bounds) return null;

  const surfaceCells = structuredSurfaceCellsFromScene(structuredNodes, bounds);
  const surfaceGrid: GridMap = new Map(
    surfaceCells.map((cell) => [
      GridManager.toKey(cell.x, cell.y),
      {
        char: cell.char,
        color: cell.color,
        ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cloneTextAttributes(cell.attrs)
          ? { attrs: cloneTextAttributes(cell.attrs) }
          : {}),
        ...(cell.href ? { href: cell.href } : {}),
      },
    ])
  );
  const selection = {
    start: { x: 0, y: 0 },
    end: { x: bounds.width - 1, y: bounds.height - 1 },
  };
  const rich: StructuredClipboardPayload = {
    type: "ascii-metropolis-clipboard",
    version: 2,
    cells: surfaceCells,
    surfaceCells,
    structuredNodes,
    bounds,
  };

  return {
    plain: exportSelectionToString(createGridMapSource(surfaceGrid), [selection]),
    rich: JSON.stringify(rich),
  };
};

export const buildStructuredTextClipboardPayload = (
  node: StructuredTextNode,
  start: number,
  end: number
): ClipboardPayload | null => {
  const text = getStructuredTextSlice(node, start, end);
  if (!text) return null;
  const rich: StructuredClipboardPayload = {
    type: "ascii-metropolis-clipboard",
    version: 2,
    cells: [],
    surfaceCells: [],
    structuredNodes: [],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    structuredText: {
      text,
      style: cloneStructuredNodeStyle(node.style),
      ...(getStructuredTextStyleRangesInRange(node.styleRanges, start, end)
        ? {
            styleRanges: getStructuredTextStyleRangesInRange(
              node.styleRanges,
              start,
              end
            ),
          }
        : {}),
    },
  };
  return {
    plain: text,
    rich: JSON.stringify(rich),
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
  structured: StructuredClipboardData | null;
  structuredText: StructuredTextClipboardData | null;
} | null => {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText) as {
      type?: string;
      cells?: RichTextCell[];
      surfaceCells?: RichTextCell[];
      structuredNodes?: unknown[];
      bounds?: Partial<NodeBounds>;
      structuredText?: Partial<StructuredTextClipboardData>;
    };
    if (parsed.type === "ascii-metropolis-clipboard") {
      const surfaceCells = Array.isArray(parsed.surfaceCells)
        ? parsed.surfaceCells
        : Array.isArray(parsed.cells)
          ? parsed.cells
          : [];
      const structuredText =
        parsed.structuredText &&
        typeof parsed.structuredText.text === "string" &&
        parsed.structuredText.style &&
        typeof parsed.structuredText.style.color === "string"
          ? {
              text: parsed.structuredText.text,
              style: cloneStructuredNodeStyle(parsed.structuredText.style),
              ...(Array.isArray(parsed.structuredText.styleRanges)
                ? { styleRanges: parsed.structuredText.styleRanges }
                : {}),
            }
          : null;
      const structuredNodes = Array.isArray(parsed.structuredNodes)
        ? parsed.structuredNodes
            .map((node) => decodeStructuredNode(node))
            .filter((node): node is StructuredNode => !!node)
        : [];
      const bounds =
        parsed.bounds &&
        typeof parsed.bounds.x === "number" &&
        typeof parsed.bounds.y === "number" &&
        typeof parsed.bounds.width === "number" &&
        typeof parsed.bounds.height === "number"
          ? {
              x: parsed.bounds.x,
              y: parsed.bounds.y,
              width: parsed.bounds.width,
              height: parsed.bounds.height,
            }
          : getSceneBounds(structuredNodes);

      return {
        richCells: surfaceCells,
        structured:
          structuredNodes.length > 0 && bounds
            ? { structuredNodes, surfaceCells, bounds }
            : null,
        structuredText,
      };
    }
    if (!Array.isArray(parsed.cells)) return null;
    return { richCells: parsed.cells, structured: null, structuredText: null };
  } catch {
    return null;
  }
};

const readRichClipboardCells = async (): Promise<{
  richCells: RichTextCell[] | null;
  structured: StructuredClipboardData | null;
  structuredText: StructuredTextClipboardData | null;
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
  renderText: RenderClipboardText = renderTextSource
) => {
  // ClipboardEvent data is only guaranteed to remain readable while the
  // event is being dispatched. Snapshot every format before the first await.
  const eventRichText = eventDataTransfer?.getData(MIME_RICH_DATA) ?? "";
  const eventPlainText = eventDataTransfer?.getData("text/plain") ?? "";
  const eventRichPayload = parseRichClipboardText(eventRichText);
  if (eventRichPayload) {
    return {
      richCells: eventRichPayload.richCells,
      structured: eventRichPayload.structured,
      structuredText: eventRichPayload.structuredText,
      plainText: eventRichPayload.structuredText?.text ?? null,
      diagnostics: [],
    };
  }

  if (eventPlainText) {
    return await toRenderedClipboardPayload(eventPlainText, defaultColor, renderText);
  }

  const richPayload = await readRichClipboardCells();
  if (richPayload) {
    return {
      richCells: richPayload.richCells,
      structured: richPayload.structured,
      structuredText: richPayload.structuredText,
      plainText: richPayload.structuredText?.text ?? null,
      diagnostics: [],
    };
  }

  const text = await clipboard.readText();
  if (text === null) {
    return {
      richCells: null,
      structured: null,
      structuredText: null,
      plainText: null,
      diagnostics: [],
      error: "clipboard-failed" as const,
    };
  }
  if (text) {
    return await toRenderedClipboardPayload(text, defaultColor, renderText);
  }

  return {
    richCells: null,
    structured: null,
    structuredText: null,
    plainText: null,
    diagnostics: [],
  };
};
