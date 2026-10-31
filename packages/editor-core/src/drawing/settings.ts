import { getGraphemeCellWidth, segmentGraphemes } from '@chardesk/protocol';
import { DEFAULT_BRUSH_CHAR } from './constants.js';

export type DrawingSettings = { char: string; foreground: string; background?: string };
export const DEFAULT_DRAWING_SETTINGS: Readonly<DrawingSettings> = Object.freeze({
  char: DEFAULT_BRUSH_CHAR,
  foreground: '#000000',
});
export function readDrawingSettings(value: unknown): DrawingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid drawing settings.');
  const input = value as Record<string, unknown>;
  const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (
    typeof input.char !== 'string' ||
    segmentGraphemes(input.char).length !== 1 ||
    /\p{Cc}/u.test(input.char) ||
    getGraphemeCellWidth(input.char) < 1 ||
    !color(input.foreground) ||
    (input.background !== undefined && !color(input.background)) ||
    Object.keys(input).some((key) => !['char', 'foreground', 'background'].includes(key))
  )
    throw new Error('Invalid drawing settings.');
  return {
    char: input.char,
    foreground: input.foreground as string,
    ...(input.background !== undefined ? { background: input.background as string } : {}),
  };
}
