import type { GridCell, GridCellSource, SelectionArea } from '@chardesk/cell-plane/types';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import {
  exportSelectionToString,
  exportSelectionToAnsi,
  exportToString,
  exportToCharDesk,
} from '@chardesk/cell-plane/text';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { EXPORT_PADDING } from '@chardesk/cell-plane/constants';
import { resolveGridSelectionCoverage, validateSelectionWork } from './selection/coverage.js';
import { serializeCanvasDocument } from './documentText.js';
import type { CanvasDocumentDraft } from './canvasDocumentModel.js';
import { orderCanvasAnchors } from './canvasAnchorModel.js';

export type CanvasTextExportFormat = 'txt' | 'ansi' | 'chardesk';
export type CanvasExportScope = 'canvas' | 'selection';
export type CanvasExportSnapshot = ReturnType<typeof captureCanvasExport>;

/** Capture once, before platform IO. Selection holes exclude their contents. */
export function captureCanvasExport(
  source: GridCellSource,
  selections?: readonly SelectionArea[],
  selectionContent: 'coverage' | 'envelope' = 'coverage'
) {
  if (selections) validateSelectionWork(selections);
  const coverage = selections ? resolveGridSelectionCoverage([...selections], source) : null;
  const box = coverage?.bounds;
  const bounds = coverage
    ? box && {
        x: box.start.x,
        y: box.start.y,
        width: box.end.x - box.start.x + 1,
        height: box.end.y - box.start.y + 1,
      }
    : (source.getContentBounds() ?? { x: 0, y: 0, width: 1, height: 1 });
  if (!bounds) throw new Error('empty-content');
  const cells = new Map<string, GridCell>();
  source.visit(bounds, (x, y, cell) => {
    if (coverage && selectionContent === 'coverage' && !coverage.contains({ x, y })) return;
    cells.set(`${x},${y}`, { ...cell, ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}) });
  });
  return {
    source: createGridMapSource(cells),
    cells,
    bounds: { ...bounds },
    scope: selections ? ('selection' as const) : ('canvas' as const),
  };
}

/** One budget for browser Canvas and native Canvas raster delivery. */
export function resolveExportRasterLayout(
  cols: number,
  rows: number,
  cellWidth: number,
  cellHeight: number
) {
  if (
    ![cols, rows, cellWidth, cellHeight].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    throw new RangeError('image-too-large');
  const width = cols * cellWidth,
    height = rows * cellHeight;
  for (const scale of [2, 1] as const) {
    const pixelWidth = width * scale,
      pixelHeight = height * scale;
    if (
      Number.isSafeInteger(pixelWidth) &&
      Number.isSafeInteger(pixelHeight) &&
      pixelWidth > 0 &&
      pixelHeight > 0 &&
      pixelWidth <= 8192 &&
      pixelHeight <= 8192 &&
      pixelWidth * pixelHeight <= 16_777_216
    )
      return { width, height, pixelWidth, pixelHeight, scale };
  }
  throw new RangeError('image-too-large');
}

export function prepareCanvasTextExport(input: {
  snapshot: CanvasExportSnapshot;
  format: CanvasTextExportFormat;
  document?: CanvasDocumentDraft;
  title?: string;
  includeColor?: boolean;
}) {
  const { snapshot, format, document, title, includeColor } = input;
  const { x, y, width, height } = snapshot.bounds;
  const areas = [{ start: { x, y }, end: { x: x + width - 1, y: y + height - 1 } }];
  if (format === 'chardesk') {
    if (snapshot.scope === 'canvas' && document)
      return serializeCanvasDocument(document, title, { includeColor });
    if (snapshot.scope === 'canvas') {
      validateSelectionWork(areas);
      return serializeCharDeskDocumentEnvelope({
        mode: 'freeform',
        title,
        body: exportToCharDesk(snapshot.source, { includeColor }),
      });
    }
    const active = document?.pages.find((page) => page.id === document.activePageId);
    const pageId = active?.id ?? 'export:page';
    return serializeCanvasDocument(
      {
        id: document?.id ?? 'export',
        mode: 'freeform',
        activePageId: pageId,
        pages: [
          {
            id: pageId,
            kind: 'cell-plane',
            name: active?.name,
            grid: [...snapshot.cells],
            anchors:
              active?.anchors &&
              orderCanvasAnchors(
                active.anchors
                  .filter((anchor) => snapshot.source.get(anchor.point))
                  .map((anchor) => structuredClone(anchor))
              ),
          },
        ],
      },
      title,
      { includeColor }
    );
  }
  // Text formats expand the envelope; reject sparse distant islands before allocation.
  validateSelectionWork(
    format === 'txt' && snapshot.scope === 'canvas'
      ? [
          {
            start: { x: x - EXPORT_PADDING, y: y - EXPORT_PADDING },
            end: { x: x + width - 1 + EXPORT_PADDING, y: y + height - 1 + EXPORT_PADDING },
          },
        ]
      : areas
  );
  if (snapshot.scope === 'canvas' && !snapshot.cells.size) return '';
  return format === 'txt'
    ? snapshot.scope === 'canvas'
      ? exportToString(snapshot.source)
      : exportSelectionToString(snapshot.source, areas)
    : exportSelectionToAnsi(snapshot.source, areas, { includeColor });
}
