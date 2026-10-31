import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';
import { MAPLE_FONT_PROFILE } from '@chardesk/font-maple';
import type { CharDeskCanvasFontResolver } from '@chardesk/rendering/canvas';

type Face = { family: string; bold: boolean; file: string; ranges: Array<[number, number]> };
let faces: Face[] | undefined;
const loaded = new Map<Face, string>();
const resolved = new Map<string, string | undefined>();
const directory = new URL('./snapshot-fonts/', import.meta.url);

/** Native Canvas lacks CSS unicode-range selection; route each glyph to its Web subset. */
export const resolveSnapshotFont: CharDeskCanvasFontResolver = ({ grapheme, bold }) => {
  const key = `${bold}:${grapheme}`;
  if (resolved.has(key)) return resolved.get(key);
  faces ??= JSON.parse(readFileSync(new URL('faces.json', directory), 'utf8')) as Face[];
  const capability =
    MAPLE_FONT_PROFILE.capabilities[MAPLE_FONT_PROFILE.resolveCapability(grapheme)];
  const families = (
    bold ? (capability.families.bold ?? capability.families.regular) : capability.families.regular
  )
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ''));
  const code = grapheme.codePointAt(0)!;
  for (const family of families) {
    const face = faces.find(
      (face) =>
        face.family === family &&
        face.bold === bold &&
        face.ranges.some(([start, end]) => code >= start && code <= end)
    );
    if (!face) continue;
    let alias = loaded.get(face);
    if (!alias) {
      alias = `CharDesk Snapshot ${faces.indexOf(face)}`;
      if (!GlobalFonts.registerFromPath(fileURLToPath(new URL(face.file, directory)), alias))
        throw new Error('font-unavailable');
      loaded.set(face, alias);
    }
    const font = `'${alias}'`;
    resolved.set(key, font);
    return font;
  }
  resolved.set(key, undefined);
  return undefined;
};
