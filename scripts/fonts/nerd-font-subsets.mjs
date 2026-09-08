import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { create as createFont } from "fontkit";

import { runPyftsubset } from "./fonttools.mjs";
import {
  groupNerdFontCatalog,
  nerdFontCodePoints,
} from "./nerd-font-catalog.mjs";

export const MAX_NERD_FONT_SHARD_BYTES = 96 * 1024;

const subsetFont = async ({
  codePoints,
  inputPath,
  outputPath,
  subsetCommand,
}) => {
  await runPyftsubset([
    inputPath,
    `--output-file=${outputPath}`,
    "--flavor=woff2",
    `--unicodes=${codePoints.map((codePoint) =>
      `U+${codePoint.toString(16)}`).join(",")}`,
    "--layout-features=*",
    "--glyph-names",
    "--symbol-cmap",
    "--legacy-cmap",
    "--notdef-glyph",
    "--notdef-outline",
    "--recommended-glyphs",
    "--name-IDs=*",
    "--name-legacy",
    "--name-languages=*",
  ], subsetCommand);
};

export const buildNerdFontSubsets = async ({
  catalog,
  fontBytes,
  maxShardBytes = MAX_NERD_FONT_SHARD_BYTES,
  subsetCommand = process.env.PYFTSUBSET,
}) => {
  const catalogCodePoints = [...nerdFontCodePoints(catalog)];
  const sourceFont = createFont(fontBytes);
  const missing = catalogCodePoints.filter((codePoint) =>
    !sourceFont.hasGlyphForCodePoint(codePoint));
  if (missing.length > 0) {
    throw new Error(
      `Nerd Font binary misses ${missing.length} catalog code points; first is ` +
      `U+${missing[0].toString(16).toUpperCase()}`
    );
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "chardesk-nerd-font-"));
  const inputPath = path.join(temporaryRoot, "SymbolsNerdFontMono-Regular.ttf");
  await writeFile(inputPath, fontBytes);
  let trial = 0;

  const fit = async (group, codePoints) => {
    trial += 1;
    const outputPath = path.join(temporaryRoot, `trial-${trial}.woff2`);
    try {
      await subsetFont({ codePoints, inputPath, outputPath, subsetCommand });
    } catch (error) {
      throw new Error(
        "Nerd Font subsetting requires FontTools pyftsubset with Brotli " +
        `(set PYFTSUBSET to its executable path): ${error.message}`
      );
    }
    const content = await readFile(outputPath);
    if (content.length <= maxShardBytes) {
      return [{ group, codePoints, content }];
    }
    if (codePoints.length === 1) {
      throw new Error(
        `${group}: one-glyph shard exceeds ${maxShardBytes} bytes`
      );
    }
    const middle = Math.floor(codePoints.length / 2);
    return [
      ...await fit(group, codePoints.slice(0, middle)),
      ...await fit(group, codePoints.slice(middle)),
    ];
  };

  try {
    const shards = [];
    const seen = new Set();
    for (const group of groupNerdFontCatalog(catalog)) {
      const codePoints = [];
      for (const { char } of group.entries) {
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined || seen.has(codePoint)) continue;
        seen.add(codePoint);
        codePoints.push(codePoint);
      }
      codePoints.sort((left, right) => left - right);
      if (codePoints.length > 0) shards.push(...await fit(group.id, codePoints));
    }
    if (seen.size !== catalogCodePoints.length) {
      throw new Error(
        `Nerd Font shard ownership mismatch: ${seen.size}/${catalogCodePoints.length}`
      );
    }
    return shards;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};
