import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as fontkit from "fontkit";
import { groupNerdFontCatalog } from "../fonts/nerd-font-catalog.mjs";

const UNICODE_VERSION = "17.0.0";
const EMOJI_VERSION = "17.0";
const SCHEMA_VERSION = 1;
const UCD_BASE_URL = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd`;
const EMOJI_TEST_URL =
  `https://www.unicode.org/Public/${UNICODE_VERSION}/emoji/emoji-test.txt`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outputRoot = path.join(repoRoot, "public", "data", "characters");
const sourceRoot = path.join(__dirname, "sources");
const fontRoots = [
  path.join(repoRoot, "packages", "font-maple", "assets"),
  path.join(repoRoot, "packages", "fonts", "assets"),
];
const generatedMetricsDir = path.join(
  repoRoot,
  "packages",
  "protocol",
  "src",
  "generated"
);
const verifyOnly = process.argv.includes("--verify");

const COVERAGE = { maple: 1, symbols: 2, emoji: 4, nerd: 8 };
const EXPLORER_EXCLUDED_CATEGORIES = new Set(["Cn", "Cs", "Co"]);
const ESSENTIAL_GROUPS = [
  { id: "ascii", label: "ASCII & Punctuation", ranges: [[0x20, 0x7e]] },
  { id: "lines", label: "Lines & Blocks", ranges: [[0x2500, 0x259f]] },
  {
    id: "arrows",
    label: "Arrows",
    ranges: [[0x2190, 0x21ff]],
    chars: "⟵⟶⟷⟸⟹⟺⤴⤵",
  },
  { id: "shapes", label: "Geometric Shapes", ranges: [[0x25a0, 0x25ff]] },
  {
    id: "math",
    label: "Math",
    ranges: [[0x2070, 0x209f], [0x2200, 0x22ff]],
    chars: "±×÷",
  },
  { id: "technical", label: "Technical", ranges: [[0x2300, 0x23ff]] },
  {
    id: "numbers",
    label: "Numbers & Letterlike Symbols",
    ranges: [[0x20a0, 0x20cf], [0x2100, 0x218f]],
  },
  { id: "dingbats", label: "Dingbats", ranges: [[0x2700, 0x27bf]] },
  { id: "braille", label: "Braille", ranges: [[0x2800, 0x28ff]] },
  {
    id: "common-symbols",
    label: "Common Symbols",
    chars: "★☆○●◉◌☐☑☒✓✔✕✖♠♡♢♣♤♥♦♧♪♫♭♮♯⚠",
  },
];

const sha256 = (content) =>
  createHash("sha256").update(content).digest("hex");
const slugify = (value) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
const codePointLabel = (codePoint) =>
  `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function parsePropertyRanges(text, acceptedValues) {
  const ranges = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const match = line.match(
      /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([^;]+)$/
    );
    if (!match) continue;
    const value = match[3].trim();
    if (acceptedValues && !acceptedValues.has(value)) continue;
    ranges.push({
      start: Number.parseInt(match[1], 16),
      end: Number.parseInt(match[2] ?? match[1], 16),
      value,
    });
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function parseBlocks(text) {
  return parsePropertyRanges(text).map((range) => ({
    ...range,
    value: range.value,
  }));
}

function hangulName(codePoint) {
  const index = codePoint - 0xac00;
  const leading = [
    "G", "GG", "N", "D", "DD", "R", "M", "B", "BB", "S", "SS",
    "", "J", "JJ", "C", "K", "T", "P", "H",
  ];
  const vowel = [
    "A", "AE", "YA", "YAE", "EO", "E", "YEO", "YE", "O", "WA",
    "WAE", "OE", "YO", "U", "WEO", "WE", "WI", "YU", "EU", "YI", "I",
  ];
  const trailing = [
    "", "G", "GG", "GS", "N", "NJ", "NH", "D", "L", "LG", "LM",
    "LB", "LS", "LT", "LP", "LH", "M", "B", "BS", "S", "SS", "NG",
    "J", "C", "K", "T", "P", "H",
  ];
  return `HANGUL SYLLABLE ${leading[Math.floor(index / 588)]}${
    vowel[Math.floor(index / 28) % 21]
  }${trailing[index % 28]}`;
}

function algorithmicName(baseName, codePoint) {
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) return hangulName(codePoint);
  const prefix = baseName
    .replace(/^<|>$/g, "")
    .replace(/, First$/, "")
    .toUpperCase();
  return `${prefix}-${codePoint.toString(16).toUpperCase()}`;
}

function parseUnicodeData(text) {
  const characters = new Map();
  let pendingRange = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split(";");
    const codePoint = Number.parseInt(fields[0], 16);
    const name = fields[1];
    const category = fields[2];
    if (name.endsWith(", First>")) {
      pendingRange = { start: codePoint, name, category };
      continue;
    }
    if (name.endsWith(", Last>") && pendingRange) {
      for (let value = pendingRange.start; value <= codePoint; value += 1) {
        characters.set(value, {
          name: algorithmicName(pendingRange.name, value),
          category: pendingRange.category,
        });
      }
      pendingRange = null;
      continue;
    }
    characters.set(codePoint, { name, category });
  }
  return characters;
}

function parseNameAliases(text) {
  const aliases = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [hex, alias] = line.split(";").map((value) => value.trim());
    const codePoint = Number.parseInt(hex, 16);
    const values = aliases.get(codePoint) ?? [];
    values.push(alias);
    aliases.set(codePoint, values);
  }
  return aliases;
}

function mergeEntityAliases(aliases, entities) {
  for (const category of Object.values(entities)) {
    for (const [alias, grapheme] of Object.entries(category)) {
      const codePoint = grapheme.codePointAt(0);
      const values = aliases.get(codePoint) ?? [];
      if (!values.includes(alias)) values.push(alias);
      aliases.set(codePoint, values);
    }
  }
}

function parseEmojiTest(text) {
  const groups = [];
  let group = null;
  let subgroup = "";
  for (const line of text.split(/\r?\n/)) {
    const groupMatch = line.match(/^# group:\s*(.+)$/);
    if (groupMatch) {
      group = { id: slugify(groupMatch[1]), label: groupMatch[1], entries: [] };
      groups.push(group);
      continue;
    }
    const subgroupMatch = line.match(/^# subgroup:\s*(.+)$/);
    if (subgroupMatch) {
      subgroup = subgroupMatch[1];
      continue;
    }
    const match = line.match(
      /^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*\S+\s+E[0-9.]+\s+(.+)$/
    );
    if (!match || !group) continue;
    const grapheme = match[1]
      .trim()
      .split(/\s+/)
      .map((hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .join("");
    group.entries.push({
      id: match[1].trim().replaceAll(" ", "-"),
      grapheme,
      name: match[2].trim(),
      aliases: subgroup ? [subgroup] : [],
    });
  }
  return groups;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

async function buildFontCoverage() {
  const coverage = new Map();
  const files = (await Promise.all(fontRoots.map(listFiles)))
    .flat()
    .filter((file) => file.endsWith(".woff2"));
  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    const bit = normalized.includes("/maple-mono-nf-cn/")
      ? COVERAGE.maple
      : normalized.includes("/julia-mono/")
        ? COVERAGE.symbols
        : normalized.includes("/noto-emoji/")
          ? COVERAGE.emoji
          : normalized.includes("/symbols-nerd-font-mono/")
            ? COVERAGE.nerd
            : 0;
    if (!bit) continue;
    const font = fontkit.openSync(file);
    for (const codePoint of font.characterSet) {
      coverage.set(codePoint, (coverage.get(codePoint) ?? 0) | bit);
    }
  }
  return coverage;
}

function findRangeValue(ranges, codePoint, fallback) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle];
    if (codePoint < range.start) high = middle - 1;
    else if (codePoint > range.end) low = middle + 1;
    else return range.value;
  }
  return fallback;
}

function isInRanges(ranges, codePoint) {
  return findRangeValue(ranges, codePoint, false) !== false;
}

function makeRecord(
  codePoint,
  character,
  aliases,
  scripts,
  coverage,
  defaultIgnorable
) {
  return {
    id: codePointLabel(codePoint),
    grapheme: String.fromCodePoint(codePoint),
    name: character.name,
    aliases: aliases.get(codePoint) ?? [],
    category: character.category,
    script: findRangeValue(scripts, codePoint, "Unknown"),
    coverage: coverage.get(codePoint) ?? 0,
    insertable:
      character.category !== "Cc" &&
      character.category !== "Cs" &&
      !defaultIgnorable.has(codePoint),
  };
}

function buildEssentials(
  characters,
  aliases,
  scripts,
  coverage,
  defaultIgnorable
) {
  return ESSENTIAL_GROUPS.map((definition) => {
    const codePoints = new Set();
    for (const [start, end] of definition.ranges ?? []) {
      for (let value = start; value <= end; value += 1) codePoints.add(value);
    }
    for (const char of definition.chars ?? "") codePoints.add(char.codePointAt(0));
    const entries = [...codePoints]
      .sort((left, right) => left - right)
      .flatMap((codePoint) => {
        const character = characters.get(codePoint);
        if (!character || !coverage.get(codePoint) || defaultIgnorable.has(codePoint)) {
          return [];
        }
        return [
          makeRecord(
            codePoint,
            character,
            aliases,
            scripts,
            coverage,
            defaultIgnorable
          ),
        ];
      });
    return { id: definition.id, label: definition.label, entries };
  }).filter((group) => group.entries.length > 0);
}

function buildNerdGroups(source, coverage) {
  return groupNerdFontCatalog(source).map((group) => ({
    id: group.id,
    label: group.label,
    entries: group.entries.flatMap((item) => {
      const codePoint = item.char.codePointAt(0);
      const fontCoverage = coverage.get(codePoint) ?? 0;
      if (!(fontCoverage & COVERAGE.nerd)) return [];
      return [{
        id: codePointLabel(codePoint),
        grapheme: item.char,
        name: item.name,
      }];
    }),
  }));
}

function compressRanges(codePoints) {
  const ranges = [];
  for (const value of [...codePoints].sort((left, right) => left - right)) {
    const last = ranges.at(-1);
    if (last && last[1] + 1 === value) last[1] = value;
    else ranges.push([value, value]);
  }
  return ranges;
}

function addGrouped(grouped, key, codePoint) {
  const values = grouped.get(key) ?? [];
  values.push(codePoint);
  grouped.set(key, values);
}

function toFacetEntries(grouped) {
  return [...grouped]
    .map(([label, values]) => ({
      id: slugify(label),
      label,
      count: values.length,
      ranges: compressRanges(values),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatEastAsianWidthModule(ranges) {
  const rows = ranges
    .map(({ start, end }) =>
      `  [0x${start.toString(16)}, 0x${end.toString(16)}],`
    )
    .join("\n");
  return `// Generated by scripts/data/generate-character-data.mjs.
export const UNICODE_DATA_VERSION = "${UNICODE_VERSION}";

export const WIDE_EAST_ASIAN_RANGES: ReadonlyArray<
  readonly [start: number, end: number]
> = [
${rows}
];
`;
}

async function writeHashedAsset(relativeDir, stem, data, assets) {
  const content = `${JSON.stringify(data)}\n`;
  const digest = sha256(content);
  const fileName = `${stem}.${digest.slice(0, 12)}.json`;
  const relativePath = path.posix.join(relativeDir, fileName);
  const fullDir = path.join(outputRoot, relativeDir);
  await mkdir(fullDir, { recursive: true });
  await writeFile(path.join(fullDir, fileName), content, "utf8");
  assets.push({
    path: relativePath,
    size: Buffer.byteLength(content),
    sha256: digest,
  });
  return relativePath;
}

async function verifyAssets() {
  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "manifest.json"), "utf8")
  );
  const failures = [];
  const contents = new Map();
  for (const asset of manifest.assets) {
    try {
      const content = await readFile(path.join(outputRoot, asset.path));
      contents.set(asset.path, content);
      if (content.length !== asset.size || sha256(content) !== asset.sha256) {
        failures.push(`${asset.path}: checksum mismatch`);
      }
    } catch {
      failures.push(`${asset.path}: missing`);
    }
  }
  if (manifest.counts.main > 17000) {
    failures.push("main catalog exceeds 16,500 entries");
  }
  if (manifest.counts.essentials > 2000) {
    failures.push("Essentials exceeds 2,000 entries");
  }
  const mainGzipBytes = Object.values(manifest.packs).reduce(
    (total, assetPath) => total + gzipSync(contents.get(assetPath)).length,
    0
  );
  if (mainGzipBytes > 195 * 1024) {
    failures.push(`main packs exceed 185 KiB gzip (${mainGzipBytes} bytes)`);
  }
  const unicodeManifestGzipBytes = gzipSync(
    contents.get(manifest.unicodeManifest)
  ).length;
  if (unicodeManifestGzipBytes > 40 * 1024) {
    failures.push(
      `Unicode manifest exceeds 40 KiB gzip (${unicodeManifestGzipBytes} bytes)`
    );
  }
  for (const [assetPath, content] of contents) {
    if (
      assetPath.startsWith("unicode/shards/") &&
      gzipSync(content).length > 250 * 1024
    ) {
      failures.push(`${assetPath}: exceeds 250 KiB gzip`);
    }
  }
  if (failures.length) {
    throw new Error(
      `Character asset verification failed:\n${failures.join("\n")}`
    );
  }
  console.log(
    `Verified ${manifest.assets.length} character assets (${manifest.counts.main} main entries).`
  );
}

async function main() {
  if (verifyOnly) return verifyAssets();
  const [
    blocksText,
    unicodeDataText,
    scriptsText,
    aliasesText,
    derivedCoreText,
    propListText,
    emojiText,
    eastAsianWidthText,
    nerdSource,
    entitySource,
  ] = await Promise.all([
    fetchText(`${UCD_BASE_URL}/Blocks.txt`),
    fetchText(`${UCD_BASE_URL}/UnicodeData.txt`),
    fetchText(`${UCD_BASE_URL}/Scripts.txt`),
    fetchText(`${UCD_BASE_URL}/NameAliases.txt`),
    fetchText(`${UCD_BASE_URL}/DerivedCoreProperties.txt`),
    fetchText(`${UCD_BASE_URL}/PropList.txt`),
    fetchText(EMOJI_TEST_URL),
    fetchText(`${UCD_BASE_URL}/EastAsianWidth.txt`),
    readFile(path.join(sourceRoot, "nerdfonts.json"), "utf8").then(JSON.parse),
    readFile(path.join(sourceRoot, "entities.json"), "utf8").then(JSON.parse),
  ]);
  const blocks = parseBlocks(blocksText);
  const characters = parseUnicodeData(unicodeDataText);
  const scripts = parsePropertyRanges(scriptsText);
  const aliases = parseNameAliases(aliasesText);
  mergeEntityAliases(aliases, entitySource);
  const defaultIgnorableRanges = parsePropertyRanges(
    derivedCoreText,
    new Set(["Default_Ignorable_Code_Point"])
  );
  const noncharacterRanges = parsePropertyRanges(
    propListText,
    new Set(["Noncharacter_Code_Point"])
  );
  const defaultIgnorable = new Set();
  for (const range of defaultIgnorableRanges) {
    for (let value = range.start; value <= range.end; value += 1) {
      defaultIgnorable.add(value);
    }
  }
  const coverage = await buildFontCoverage();
  const essentials = buildEssentials(
    characters,
    aliases,
    scripts,
    coverage,
    defaultIgnorable
  );
  const nerd = buildNerdGroups(nerdSource, coverage);
  const emoji = parseEmojiTest(emojiText);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await mkdir(generatedMetricsDir, { recursive: true });
  const assets = [];
  const packs = {
    essentials: await writeHashedAsset(
      "packs",
      "essentials",
      { schemaVersion: SCHEMA_VERSION, groups: essentials },
      assets
    ),
    nerd: await writeHashedAsset(
      "packs",
      "nerd",
      { schemaVersion: SCHEMA_VERSION, groups: nerd },
      assets
    ),
    emoji: await writeHashedAsset(
      "packs",
      "emoji",
      { schemaVersion: SCHEMA_VERSION, groups: emoji },
      assets
    ),
  };

  const blockGroups = new Map();
  const scriptGroups = new Map();
  const categoryGroups = new Map();
  const shards = new Map();
  const nameIndex = [];
  for (const [codePoint, character] of characters) {
    if (EXPLORER_EXCLUDED_CATEGORIES.has(character.category)) continue;
    if (isInRanges(noncharacterRanges, codePoint)) continue;
    const block = findRangeValue(blocks, codePoint, "No Block");
    const record = makeRecord(
      codePoint,
      character,
      aliases,
      scripts,
      coverage,
      defaultIgnorable
    );
    const shardId = Math.floor(codePoint / 1024)
      .toString(16)
      .padStart(3, "0");
    const records = shards.get(shardId) ?? [];
    records.push(record);
    shards.set(shardId, records);
    addGrouped(blockGroups, block, codePoint);
    addGrouped(scriptGroups, record.script, codePoint);
    addGrouped(categoryGroups, record.category, codePoint);
    nameIndex.push([
      codePoint,
      `${record.name} ${record.aliases.join(" ")}`.toLowerCase(),
    ]);
  }
  const shardPaths = {};
  for (const [shardId, records] of shards) {
    shardPaths[shardId] = await writeHashedAsset(
      "unicode/shards",
      shardId,
      { schemaVersion: SCHEMA_VERSION, records },
      assets
    );
  }
  const nameIndexPath = await writeHashedAsset(
    "unicode",
    "name-index",
    { schemaVersion: SCHEMA_VERSION, entries: nameIndex },
    assets
  );
  const unicodeManifest = await writeHashedAsset(
    "unicode",
    "manifest",
    {
      schemaVersion: SCHEMA_VERSION,
      unicodeVersion: UNICODE_VERSION,
      shardSize: 1024,
      shards: shardPaths,
      nameIndex: nameIndexPath,
      facets: {
        block: toFacetEntries(blockGroups),
        script: toFacetEntries(scriptGroups),
        category: toFacetEntries(categoryGroups),
      },
    },
    assets
  );
  const counts = {
    essentials: essentials.reduce(
      (total, group) => total + group.entries.length,
      0
    ),
    nerd: nerd.reduce((total, group) => total + group.entries.length, 0),
    emoji: emoji.reduce((total, group) => total + group.entries.length, 0),
    unicode: nameIndex.length,
  };
  counts.main = counts.essentials + counts.nerd + counts.emoji;
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    unicodeVersion: UNICODE_VERSION,
    emojiVersion: EMOJI_VERSION,
    packs,
    unicodeManifest,
    counts,
    assets: assets.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(generatedMetricsDir, "eastAsianWidth.ts"),
    formatEastAsianWidthModule(
      parsePropertyRanges(eastAsianWidthText, new Set(["W", "F"]))
    ),
    "utf8"
  );
  console.log(
    `Generated ${counts.main} main and ${counts.unicode} Unicode explorer entries.`
  );
  await verifyAssets();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
