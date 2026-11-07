import { readFileSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Package the existing Web font subsets; CSS remains the coverage/weight authority. */
export async function prepareSnapshotFonts(root: string, destination: string) {
  const faces = [];
  await mkdir(destination, { recursive: true });
  for (const pack of ['fonts', 'font-maple']) {
    const directory = resolve(root, 'packages', pack);
    await cp(resolve(directory, 'assets'), resolve(destination, pack, 'assets'), {
      recursive: true,
    });
    if (pack === 'font-maple')
      await cp(resolve(directory, 'LICENSE'), resolve(destination, pack, 'LICENSE'));
    const css = readFileSync(resolve(directory, 'fonts.css'), 'utf8');
    for (const [, body] of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
      const fields = Object.fromEntries(
        [...body!.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]!.trim()])
      );
      const file = fields.src?.match(/url\(['"]?(\.\/[^'"\s)]+)['"]?\)/)?.[1];
      if (!file || !fields['font-family'] || !fields['unicode-range'])
        throw new Error(`Invalid bundled font face: ${pack}`);
      const ranges = fields['unicode-range'].split(',').map((range) => {
        const match = range.trim().match(/^U\+([\da-f]+)(?:-([\da-f]+))?$/i);
        if (!match) throw new Error(`Invalid bundled font range: ${range}`);
        return [parseInt(match[1]!, 16), parseInt(match[2] ?? match[1]!, 16)];
      });
      faces.push({
        family: fields['font-family'].replace(/^['"]|['"]$/g, ''),
        bold: fields['font-weight'] === '700',
        file: `${pack}/${file.slice(2)}`,
        ranges,
      });
    }
  }
  await writeFile(resolve(destination, 'faces.json'), JSON.stringify(faces));
}
