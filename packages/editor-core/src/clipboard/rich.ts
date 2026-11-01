import { getGraphemeCellWidth, segmentGraphemes } from '@chardesk/protocol';
import type { ClipboardPayload } from './payload.js';
import type { RichTextCell } from '../textCommandTypes.js';

export const CHARDESK_CLIPBOARD_MIME = 'web application/x-ascii-metropolis';
const MAX_RICH_BYTES = 16_777_216;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeString = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit && !/\p{Cc}/u.test(value);

/** All hosts validate untrusted rich data before it reaches a write command. */
export function parseRichClipboardText(
  raw: string
): { richCells: RichTextCell[]; plainText: string | null } | null {
  if (!raw || raw.length > MAX_RICH_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value)) return null;
    const data =
      value.type === 'ascii-metropolis-clipboard'
        ? (value.surfaceCells ?? value.cells)
        : value.cells;
    if (!Array.isArray(data) || data.length > 100_000) return null;
    const richCells: RichTextCell[] = [];
    for (const cell of data) {
      if (
        !record(cell) ||
        !Number.isSafeInteger(cell.x) ||
        !Number.isSafeInteger(cell.y) ||
        !safeString(cell.char, 256) ||
        !cell.char ||
        segmentGraphemes(cell.char).length !== 1 ||
        !Number.isSafeInteger(Number(cell.x) + getGraphemeCellWidth(cell.char) - 1) ||
        !safeString(cell.color, 128) ||
        !cell.color
      )
        return null;
      if (
        (cell.bgColor !== undefined && !safeString(cell.bgColor, 128)) ||
        (cell.href !== undefined && !safeString(cell.href, 8192))
      )
        return null;
      if (
        cell.attrs !== undefined &&
        (!record(cell.attrs) ||
          Object.entries(cell.attrs).some(
            ([name, enabled]) =>
              !['bold', 'italic', 'underline', 'strike', 'inverse'].includes(name) ||
              enabled !== true
          ))
      )
        return null;
      richCells.push({
        x: Number(cell.x),
        y: Number(cell.y),
        char: cell.char,
        color: cell.color,
        ...(typeof cell.bgColor === 'string' ? { bgColor: cell.bgColor } : {}),
        ...(typeof cell.href === 'string' ? { href: cell.href } : {}),
        ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
      });
    }
    return {
      richCells,
      plainText:
        record(value.structuredText) && typeof value.structuredText.text === 'string'
          ? value.structuredText.text
          : null,
    };
  } catch {
    return null;
  }
}

/** HTML is a portable multi-format carrier; the visible representation stays plain text. */
export function buildRichClipboardHtml(payload: ClipboardPayload) {
  if (!payload.rich || !parseRichClipboardText(payload.rich)) return null;
  const text = payload.plain
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  try {
    const html = `<pre data-chardesk-clipboard="${encodeURIComponent(payload.rich)}">${text}</pre>`;
    return html.length <= MAX_RICH_BYTES * 3 ? html : null;
  } catch {
    return null;
  }
}

export function parseRichClipboardHtml(html: string) {
  if (html.length > MAX_RICH_BYTES * 3) return null;
  const match = /<pre\b[^>]*\sdata-chardesk-clipboard="([^"]*)"/i.exec(html);
  if (!match) return null;
  try {
    return parseRichClipboardText(decodeURIComponent(match[1]!));
  } catch {
    return null;
  }
}
