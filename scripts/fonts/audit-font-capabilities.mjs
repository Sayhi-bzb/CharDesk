import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import { nerdFontCodePoints } from "./nerd-font-catalog.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fontExtensions = new Set([".otf", ".ttf", ".woff", ".woff2"]);
const blocks = {
  ascii: [0x20, 0x7e],
  boxDrawing: [0x2500, 0x257f],
  blockElements: [0x2580, 0x259f],
  braille: [0x2800, 0x28ff],
  hiragana: [0x3040, 0x309f],
  katakana: [0x30a0, 0x30ff],
  cjkExtensionA: [0x3400, 0x4dbf],
  cjkUnified: [0x4e00, 0x9fff],
  cjkCompatibility: [0xf900, 0xfaff],
};

const args = process.argv.slice(2);
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const baselineArgument = optionValue("--baseline");
const catalogArgument = optionValue("--catalog")
  ?? "scripts/data/sources/nerdfonts.json";
const positional = args.filter((argument, index) =>
  !argument.startsWith("--") && args[index - 1] !== "--baseline"
  && args[index - 1] !== "--catalog");

if (positional.length === 0) {
  console.error(
    "Usage: node scripts/fonts/audit-font-capabilities.mjs "
      + "[--baseline <font-or-directory>] [--catalog <json>] <font-or-directory>..."
  );
  process.exitCode = 1;
} else {
  const resolveInput = (value) => path.resolve(repoRoot, value);
  const listFontFiles = async (input) => {
    const inputStat = await stat(input);
    if (inputStat.isFile()) return [input];
    const entries = await readdir(input, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && fontExtensions.has(path.extname(entry.name)))
      .map((entry) => path.join(input, entry.name))
      .sort();
  };

  const loadTarget = async (input) => {
    const files = await listFontFiles(input);
    const codePoints = new Set();
    const glyphs = new Map();
    const faces = [];
    let bytes = 0;
    for (const file of files) {
      const fileStat = await stat(file);
      const font = fontkit.openSync(file);
      bytes += fileStat.size;
      faces.push({
        file: path.relative(repoRoot, file),
        bytes: fileStat.size,
        family: font.familyName,
        postscriptName: font.postscriptName,
        unitsPerEm: font.unitsPerEm,
        ascent: font.ascent,
        descent: font.descent,
      });
      for (const codePoint of font.characterSet) {
        codePoints.add(codePoint);
        glyphs.set(codePoint, { font, glyph: font.glyphForCodePoint(codePoint) });
      }
    }
    return { input, files, faces, bytes, codePoints, glyphs };
  };

  const catalog = JSON.parse(await readFile(resolveInput(catalogArgument), "utf8"));
  const nerdCodePoints = nerdFontCodePoints(catalog);
  const baseline = baselineArgument
    ? await loadTarget(resolveInput(baselineArgument))
    : undefined;
  const targets = await Promise.all(positional.map((value) => loadTarget(resolveInput(value))));

  const countRange = (set, [start, end]) => {
    let count = 0;
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      if (set.has(codePoint)) count += 1;
    }
    return count;
  };
  const summarize = (target) => {
    const coverage = Object.fromEntries(Object.entries(blocks).map(([id, range]) => [
      id,
      { covered: countRange(target.codePoints, range), total: range[1] - range[0] + 1 },
    ]));
    const sampleAdvances = Object.fromEntries(
      [0x41, 0x2500, 0x2800, 0x3042, 0x4e2d, 0xe0b0]
        .filter((codePoint) => target.glyphs.has(codePoint))
        .map((codePoint) => {
          const { font, glyph } = target.glyphs.get(codePoint);
          return [
            `U+${codePoint.toString(16).toUpperCase()}`,
            {
              units: glyph.advanceWidth,
              em: Number((glyph.advanceWidth / font.unitsPerEm).toFixed(4)),
            },
          ];
        })
    );
    const nerdCovered = [...nerdCodePoints]
      .filter((codePoint) => target.codePoints.has(codePoint)).length;
    const faceMetrics = new Map();
    for (const face of target.faces) {
      const metrics = {
        family: face.family,
        postscriptName: face.postscriptName,
        unitsPerEm: face.unitsPerEm,
        ascent: face.ascent,
        descent: face.descent,
      };
      const key = JSON.stringify(metrics);
      const group = faceMetrics.get(key) ?? { ...metrics, files: 0, bytes: 0 };
      group.files += 1;
      group.bytes += face.bytes;
      faceMetrics.set(key, group);
    }
    const result = {
      input: path.relative(repoRoot, target.input),
      files: target.files.length,
      bytes: target.bytes,
      codePoints: target.codePoints.size,
      coverage,
      nerd: { covered: nerdCovered, total: nerdCodePoints.size },
      sampleAdvances,
      faceMetrics: [...faceMetrics.values()],
    };
    if (!baseline) return result;
    const missing = [...baseline.codePoints]
      .filter((codePoint) => !target.codePoints.has(codePoint));
    let equalNerdOutlines = 0;
    let comparableNerdOutlines = 0;
    for (const codePoint of nerdCodePoints) {
      const left = baseline.glyphs.get(codePoint);
      const right = target.glyphs.get(codePoint);
      if (!left || !right) continue;
      comparableNerdOutlines += 1;
      if (
        left.glyph.advanceWidth === right.glyph.advanceWidth
        && JSON.stringify(left.glyph.path.commands)
          === JSON.stringify(right.glyph.path.commands)
      ) equalNerdOutlines += 1;
    }
    return {
      ...result,
      baseline: {
        input: path.relative(repoRoot, baseline.input),
        missingCodePoints: missing.length,
        missingByBlock: Object.fromEntries(Object.entries(blocks).map(([id, range]) => [
          id,
          missing.filter((codePoint) => codePoint >= range[0] && codePoint <= range[1]).length,
        ])),
        nerdOutlines: {
          comparable: comparableNerdOutlines,
          equal: equalNerdOutlines,
        },
      },
    };
  };

  console.log(JSON.stringify({
    schemaVersion: 1,
    nerdCatalogCodePoints: nerdCodePoints.size,
    targets: targets.map(summarize),
  }, null, 2));
}
