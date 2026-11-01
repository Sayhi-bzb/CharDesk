import { createCharDeskMarkdownRenderOptions } from '@chardesk/chargraph/markdown';
import type { TerminalAppearanceSnapshot } from './appearance.ts';
import { compileCharDeskText } from '@chardesk/chargraph';
import { parseCharDeskDocumentEnvelope } from '@chardesk/document';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import type { ClipboardTextPreparation } from '@chardesk/editor-core/clipboard/commands';

export type PasteMode = 'auto' | 'plain' | 'ansi' | 'markdown';

/** Capture Host appearance once, then compile outside document transactions. */
export function createTextPreparation(
  mode: PasteMode = 'auto',
  captureAppearance?: () => Promise<TerminalAppearanceSnapshot>
): ClipboardTextPreparation {
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
    const appearance =
      !envelope && (mode === 'auto' || mode === 'markdown')
        ? await captureAppearance?.()
        : undefined;
    const markdown = appearance
      ? createCharDeskMarkdownRenderOptions({ theme: appearance.contentTheme })
      : {};
    if (appearance && !appearance.palette) {
      // Neutral semantic styles retain attributes, while authored ANSI remains literal.
      for (const styles of [markdown.styles, markdown.extensionStyles])
        for (const style of Object.values(styles ?? {})) {
          if (style) delete style.bgColor;
        }
    }
    const result = await compileCharDeskText(envelope?.body ?? source, {
      format: envelope ? 'chardesk' : mode,
      defaultStyle: { color: state.foreground },
      markdown: { ...markdown, proseWrapWidth: 80 },
    });
    return {
      richRows: result.rows.map((row) => ({
        y: row.y,
        spans: row.spans.map((span) => ({ ...span, color: span.color ?? state.foreground })),
      })),
      diagnostics:
        appearance && !appearance.palette && result.renderer === 'markdown'
          ? [
              ...result.diagnostics,
              {
                code: 'terminal-colors-unavailable',
                message: 'Terminal colors unavailable; generated styles inherit the foreground.',
              },
            ]
          : result.diagnostics,
      headings: result.headings,
    };
  };
}
