import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import type { Point } from '@chardesk/cell-plane/types';
import { getTextCellWidth } from '@chardesk/protocol';
import { CanvasWriteError, type CanvasStrokeStyle } from '@chardesk/editor-core/writeText';
import type { RichTextRow } from '@chardesk/editor-core/textCommandTypes';
export const isCanvasStrokeStyle = (value: unknown): value is CanvasStrokeStyle => {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.color !== undefined && typeof candidate.color !== 'string') return false;
  if (candidate.bgColor !== undefined && typeof candidate.bgColor !== 'string') return false;
  if (candidate.href !== undefined && typeof candidate.href !== 'string') return false;
  if (
    candidate.attrs !== undefined &&
    (!candidate.attrs || typeof candidate.attrs !== 'object' || Array.isArray(candidate.attrs))
  )
    return false;
  return true;
};

export const literalRows = (
  content: string,
  style: CanvasStrokeStyle,
  fallbackColor: string
): readonly RichTextRow[] => {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.some((line) => /\p{Cc}/u.test(line)))
    throw new CanvasWriteError(
      'invalid_input',
      'Content must be plain Unicode text; tabs and control characters are unsupported.'
    );
  return lines.flatMap((text, y) =>
    text
      ? [
          {
            y,
            spans: [
              {
                x: 0,
                text,
                width: getTextCellWidth(text),
                color: style.color ?? fallbackColor,
                ...(style.bgColor ? { bgColor: style.bgColor } : {}),
                ...(style.attrs ? { attrs: style.attrs } : {}),
                ...(style.href ? { href: style.href } : {}),
              },
            ],
          },
        ]
      : []
  );
};

export function fillRows(
  surface: CanvasSurfaceReader,
  origin: Point,
  size: readonly [number, number],
  style: CanvasStrokeStyle
): RichTextRow[] {
  const rows: RichTextRow[] = [];
  for (const row of surface.rows({ x: origin.x, y: origin.y, width: size[0]!, height: size[1]! })) {
    const spans = row.spans.flatMap((span) => {
      let x = span.x;
      return span.cells.flatMap((cell) => {
        const cellX = x;
        x += getTextCellWidth(cell.char);
        if (/^\s+$/u.test(cell.char)) return [];
        return [
          {
            x: cellX - origin.x,
            text: cell.char,
            width: getTextCellWidth(cell.char),
            color: style.color ?? cell.color,
            bgColor: style.bgColor ?? cell.bgColor,
            attrs: style.attrs ?? cell.attrs,
            href: style.href ?? cell.href,
          },
        ];
      });
    });
    if (spans.length > 0) rows.push({ y: row.y - origin.y, spans });
  }

  return rows;
}
