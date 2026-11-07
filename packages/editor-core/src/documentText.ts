import {
  parseCharDeskDocumentEnvelope,
  serializeCharDeskDocumentEnvelope,
} from '@chardesk/document';
import { parseCharDeskText, getGraphemeCellWidth } from '@chardesk/protocol';
import { exportToCharDesk } from '@chardesk/cell-plane/text';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import { readCanvasAnchor, orderCanvasAnchors, type CanvasAnchor } from './canvasAnchorModel.js';
import type { CanvasDocumentDraft, CanvasPageDraft } from './canvasDocumentModel.js';

type PageText = Omit<CanvasPageDraft, 'grid' | 'kind'> & {
  origin: { x: number; y: number };
  /** Only inactive pages carry text here; active text belongs to envelope.body. */
  text?: string;
  fragments?: { origin: { x: number; y: number }; text: string }[];
};
type CanvasTextMetadata = {
  version: 1;
  documentId: string;
  activePageId: string;
  pages: PageText[];
};
const RECTANGULAR_TEXT_AREA = 2_000_000;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function fail(): never {
  throw new Error('Invalid or unsupported Canvas metadata.');
}

function encodePage(
  grid: NonNullable<CanvasPageDraft['grid']>,
  options?: { includeColor?: boolean }
) {
  const source = createGridMapSource(new Map(grid)),
    bounds = source.getContentBounds();
  if (!bounds || bounds.width * bounds.height <= RECTANGULAR_TEXT_AREA)
    return [
      {
        origin: bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 },
        text: exportToCharDesk(source, options),
      },
    ];
  // Sparse islands stay sparse on disk; distance must not determine allocation.
  const sorted = grid
    .map(([key, cell]) => {
      const [x, y] = key.split(',').map(Number);
      return { key, cell, x: x!, y: y! };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: NonNullable<CanvasPageDraft['grid']>[] = [];
  let previousY = NaN,
    end = NaN,
    start = 0;
  for (const entry of sorted) {
    if (entry.y !== previousY || entry.x - end > 64 || entry.x - start >= RECTANGULAR_TEXT_AREA) {
      groups.push([]);
      start = entry.x;
    }
    groups.at(-1)!.push([entry.key, entry.cell]);
    previousY = entry.y;
    end = entry.x + getGraphemeCellWidth(entry.cell.char);
  }
  return groups.map((group) => {
    const reader = createGridMapSource(new Map(group)),
      box = reader.getContentBounds();
    return {
      origin: box ? { x: box.x, y: box.y } : { x: 0, y: 0 },
      text: exportToCharDesk(reader, options),
    };
  });
}

export function serializeCanvasDocument(
  document: CanvasDocumentDraft,
  title?: string,
  options?: { includeColor?: boolean }
) {
  if (document.mode !== 'freeform') throw new Error('Expected a Freeform document.');
  let body = '';
  const pages = document.pages.map(({ grid = [], ...page }): PageText => {
    const encoded = encodePage(grid, options),
      { text, origin } = encoded[0]!;
    const descriptor = { id: page.id, name: page.name, size: page.size, anchors: page.anchors };
    const fragments = encoded.length > 1 ? { fragments: encoded.slice(1) } : {};
    if (page.id === document.activePageId) {
      body = text;
      return { ...descriptor, origin, ...fragments };
    }
    return { ...descriptor, origin, text, ...fragments };
  });
  const canvas: CanvasTextMetadata = {
    version: 1,
    documentId: document.id,
    activePageId: document.activePageId,
    pages,
  };
  // Validate our own output too; incomplete drafts must never overwrite a valid file.
  const source = serializeCharDeskDocumentEnvelope({ mode: 'freeform', title, body, canvas });
  parseCanvasDocument(source);
  return source;
}

export function parseCanvasDocument(
  source: string,
  documentId?: string
): { document: CanvasDocumentDraft; title?: string } {
  const envelope = parseCharDeskDocumentEnvelope(source, { allowCanvasMetadata: true });
  if (!envelope || envelope.mode !== 'freeform')
    throw new Error('Open a native Freeform .chardesk document.');
  const raw = envelope.canvas;
  let metadata: CanvasTextMetadata;
  if (raw === undefined) {
    const id = documentId ?? 'terminal-main';
    metadata = {
      version: 1,
      documentId: id,
      activePageId: `${id}:page:main`,
      pages: [{ id: `${id}:page:main`, origin: { x: 0, y: 0 } }],
    };
  } else {
    if (
      !record(raw) ||
      raw.version !== 1 ||
      typeof raw.documentId !== 'string' ||
      !raw.documentId ||
      typeof raw.activePageId !== 'string' ||
      !Array.isArray(raw.pages) ||
      !raw.pages.length ||
      Object.keys(raw).some(
        (key) => !['version', 'documentId', 'activePageId', 'pages'].includes(key)
      )
    )
      fail();
    const ids = new Set<string>();
    for (const candidate of raw.pages) {
      if (
        !record(candidate) ||
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        ids.has(candidate.id) ||
        !record(candidate.origin) ||
        Object.keys(candidate.origin).some((key) => !['x', 'y'].includes(key)) ||
        !Number.isSafeInteger(candidate.origin.x) ||
        !Number.isSafeInteger(candidate.origin.y) ||
        (candidate.name !== undefined && typeof candidate.name !== 'string') ||
        Object.keys(candidate).some(
          (key) => !['id', 'name', 'size', 'origin', 'anchors', 'text', 'fragments'].includes(key)
        )
      )
        fail();
      ids.add(candidate.id);
      if (candidate.fragments !== undefined) {
        if (!Array.isArray(candidate.fragments)) fail();
        for (const fragment of candidate.fragments) {
          if (
            !record(fragment) ||
            typeof fragment.text !== 'string' ||
            !record(fragment.origin) ||
            !Number.isSafeInteger(fragment.origin.x) ||
            !Number.isSafeInteger(fragment.origin.y) ||
            Object.keys(fragment).some((key) => !['text', 'origin'].includes(key)) ||
            Object.keys(fragment.origin).some((key) => !['x', 'y'].includes(key))
          )
            fail();
        }
      }
      if (
        candidate.id === raw.activePageId
          ? candidate.text !== undefined
          : typeof candidate.text !== 'string'
      )
        fail();
      if (
        candidate.size !== undefined &&
        (!record(candidate.size) ||
          Object.keys(candidate.size).some((key) => !['columns', 'rows'].includes(key)) ||
          !Number.isSafeInteger(candidate.size.columns) ||
          !Number.isSafeInteger(candidate.size.rows) ||
          Number(candidate.size.columns) <= 0 ||
          Number(candidate.size.rows) <= 0)
      )
        fail();
      if (candidate.anchors !== undefined) {
        if (!Array.isArray(candidate.anchors)) fail();
        const anchors: CanvasAnchor[] = candidate.anchors.map((anchor: unknown) => {
          if (
            !record(anchor) ||
            Object.keys(anchor).some(
              (key) => !['id', 'point', 'label', 'order', 'parentId', 'detached'].includes(key)
            ) ||
            !record(anchor.point) ||
            Object.keys(anchor.point).some((key) => !['x', 'y'].includes(key))
          )
            fail();
          return readCanvasAnchor(anchor) ?? fail();
        });
        if (new Set(anchors.map((anchor) => anchor.id)).size !== anchors.length) fail();
        const normalized = orderCanvasAnchors(anchors);
        if (
          normalized.some(
            (anchor) =>
              anchors.find((original) => original.id === anchor.id)?.parentId !== anchor.parentId
          )
        )
          fail();
      }
    }
    if (!ids.has(raw.activePageId)) fail();
    metadata = raw as CanvasTextMetadata;
  }
  const pages = metadata.pages.map(
    ({ origin, text, fragments = [], ...descriptor }): CanvasPageDraft => {
      const grid: NonNullable<CanvasPageDraft['grid']> = [];
      const occupied = fragments.length ? new Set<string>() : null;
      for (const fragment of [
        { origin, text: descriptor.id === metadata.activePageId ? envelope.body : text! },
        ...fragments,
      ]) {
        const parsed = parseCharDeskText(fragment.text, {
          syntax: 'ansi',
          defaultStyle: { color: '#000000' },
        });
        if (parsed.diagnostics.length) throw new Error(parsed.diagnostics[0]!.message);
        for (const { x, y, text: char, width, ...style } of parsed.cells) {
          const point = { x: x + fragment.origin.x, y: y + fragment.origin.y };
          if (
            !Number.isSafeInteger(point.x) ||
            !Number.isSafeInteger(point.y) ||
            !Number.isSafeInteger(point.x + width - 1)
          )
            fail();
          for (let offset = 0; offset < width; offset++) {
            const key = `${point.x + offset},${point.y}`;
            if (occupied?.has(key)) fail();
            occupied?.add(key);
          }
          grid.push([`${point.x},${point.y}`, { ...style, char, color: style.color ?? '#000000' }]);
        }
      }
      return { ...descriptor, kind: 'cell-plane', grid };
    }
  );
  return {
    title: envelope.title,
    document: {
      id: documentId ?? metadata.documentId,
      mode: 'freeform',
      activePageId: metadata.activePageId,
      pages,
    },
  };
}
