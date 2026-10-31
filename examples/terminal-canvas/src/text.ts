import { compileCharDeskText } from '@chardesk/chargraph';
import { parseCharDeskDocumentEnvelope } from '@chardesk/document';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import type { ClipboardTextPreparation } from '@chardesk/editor-core/clipboard/commands';

export type PasteMode = 'auto' | 'plain' | 'ansi' | 'markdown';

/** Terminal policy over the shared, DOM-free compiler. No browser profile or palette. */
export function createTextPreparation(mode: PasteMode = 'auto'): ClipboardTextPreparation {
  return async (source, state) => {
    const envelope = parseCharDeskDocumentEnvelope(source, { allowCanvasMetadata: true });
    if (envelope?.canvas !== undefined) {
      const { document } = parseCanvasDocument(source);
      const grid = document.pages.find((page) => page.id === document.activePageId)?.grid ?? [];
      const points = grid.map(([key, cell]) => {
        const [x, y] = key.split(',').map(Number);
        return { x: x!, y: y!, ...cell };
      });
      const origin = points.reduce(
        (at, cell) => ({ x: Math.min(at.x, cell.x), y: Math.min(at.y, cell.y) }),
        { x: Infinity, y: Infinity }
      );
      return {
        richCells: points.map((cell) => ({ ...cell, x: cell.x - origin.x, y: cell.y - origin.y })),
        diagnostics: [
          {
            code: 'canvas-content-only',
            message: 'Pasted active-page content. Open the file to retain its pages and anchors.',
          },
        ],
      };
    }
    if (envelope && envelope.mode !== 'freeform')
      throw new Error('Paste a Freeform document; Slides are not supported by this host.');
    const result = await compileCharDeskText(envelope?.body ?? source, {
      format: envelope ? 'chardesk' : mode,
      defaultStyle: { color: state.foreground },
      markdown: { proseWrapWidth: 80 },
    });
    return {
      richRows: result.rows.map((row) => ({
        y: row.y,
        spans: row.spans.map((span) => ({ ...span, color: span.color ?? state.foreground })),
      })),
      diagnostics: result.diagnostics,
      headings: result.headings,
    };
  };
}
