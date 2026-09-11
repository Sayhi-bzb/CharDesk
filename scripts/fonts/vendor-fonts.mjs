import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { create as createFont } from "fontkit";
import {
  formatNerdFontRangesModule,
  nerdFontCodePoints,
} from "./nerd-font-catalog.mjs";
import { buildNerdFontSubsets } from "./nerd-font-subsets.mjs";
import { runPyftsubset } from "./fonttools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);
const verifyOnly = process.argv.includes("--verify");
const targetArgument = process.argv.find((argument) =>
  argument.startsWith("--target=")
);
const sourceArgument = process.argv.find((argument) =>
  argument.startsWith("--source=")
);
const requestedSource = sourceArgument?.slice("--source=".length);
const nerdOnly = requestedSource === "symbols-nerd-font-mono";
const requestedTarget = targetArgument?.slice("--target=".length) ??
  (nerdOnly ? "canvas-core" : undefined);
const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "Chrome/138.0.0.0 Safari/537.36";

const targets = {
  "app-ui": {
    outputRoot: path.join(repoRoot, "public", "fonts"),
    assetPrefix: "",
  },
  "canvas-core": {
    outputRoot: path.join(repoRoot, "packages", "fonts"),
    assetPrefix: "assets",
    profileId: "chardesk/system-v6",
  },
  maple: {
    outputRoot: path.join(repoRoot, "packages", "font-maple"),
    assetPrefix: "assets",
    profileId: "chardesk/maple-v6",
  },
  fusion: {
    outputRoot: path.join(repoRoot, "packages", "font-fusion"),
    assetPrefix: "assets",
  },
  xiaolai: {
    outputRoot: path.join(repoRoot, "packages", "font-xiaolai"),
    assetPrefix: "assets",
  },
};

if (requestedTarget && !Object.hasOwn(targets, requestedTarget)) {
  throw new Error(`Unknown font target: ${requestedTarget}`);
}
if (requestedSource && !nerdOnly) {
  throw new Error(`Unknown independently refreshable font source: ${requestedSource}`);
}
if (nerdOnly && requestedTarget !== "canvas-core") {
  throw new Error("symbols-nerd-font-mono belongs to canvas-core");
}

const targetEntries = Object.entries(targets).filter(
  ([targetId]) => !requestedTarget || targetId === requestedTarget
);

const sources = [
  {
    target: "app-ui",
    id: "inter",
    family: "Inter",
    version: "google-fonts-v20",
    cssUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    versionMarker: "/inter/v20/",
    licenseUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt",
    headers: { "User-Agent": browserUserAgent },
  },
  {
    target: "app-ui",
    id: "noto-sans-sc",
    family: "Noto Sans SC",
    version: "google-fonts-v40",
    cssUrl:
      "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&display=swap",
    versionMarker: "/notosanssc/v40/",
    licenseUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt",
    headers: { "User-Agent": browserUserAgent },
  },
  {
    target: "maple",
    id: "maple-mono-nf-cn",
    family: "Maple Mono NF CN",
    version: "7.900",
    cssUrl: "https://fontsapi.zeoseven.com/442/main/result.css",
    versionMarker: "VersionString Version 7.900",
    licenseUrl:
      "https://raw.githubusercontent.com/subframe7536/maple-font/v7.9/OFL.txt",
  },
  {
    target: "maple",
    id: "maple-mono-nf-cn-bold",
    family: "Maple Mono NF CN",
    version: "7.900",
    cssUrl: "https://fontsapi.zeoseven.com/442/bold/result.css",
    versionMarker: "VersionString Version 7.900",
    licenseUrl:
      "https://raw.githubusercontent.com/subframe7536/maple-font/v7.9/OFL.txt",
  },
  {
    target: "canvas-core",
    id: "noto-emoji",
    family: "Noto Emoji",
    version: "google-fonts-v62",
    cssUrl:
      "https://fonts.googleapis.com/css2?family=Noto+Emoji:wght@400&display=swap",
    versionMarker: "/notoemoji/v62/",
    licenseUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/OFL.txt",
    headers: { "User-Agent": browserUserAgent },
  },
];

const binarySources = [
  {
    target: "canvas-core",
    id: "julia-mono",
    family: "JuliaMono",
    version: "0.63.2",
    binaryUrl:
      "https://raw.githubusercontent.com/cormullion/juliamono/v0.63.2/" +
      "webfonts/JuliaMono-Regular.woff2",
    binarySha256:
      "cd371c92e94978a6888b71e89a4b57f443604ad63595150511ceb7d5c354b857",
    fontFile: "JuliaMono-Regular.woff2",
    subsets: [
      { id: "base", file: "base.woff2", unicodeRange: "U+0000-1FFF" },
      { id: "punctuation", file: "punctuation.woff2", unicodeRange: "U+2000-218F" },
      { id: "arrows", file: "arrows.woff2", unicodeRange: "U+2190-21FF, U+27F0-27FF, U+2900-297F" },
      { id: "math-technical", file: "math-technical.woff2", unicodeRange: "U+2200-23FF, U+27C0-27EF, U+2980-2AFF" },
      { id: "graphics", file: "graphics.woff2", unicodeRange: "U+2400-27BF, U+2800-28FF, U+2B00-2BFF" },
      { id: "scripts", file: "scripts.woff2", unicodeRange: "U+2C00-1D3FF" },
      { id: "math-alphanumerics", file: "math-alphanumerics.woff2", unicodeRange: "U+1D400-1D7FF" },
      { id: "supplemental", file: "supplemental.woff2", unicodeRange: "U+1D800-10FFFF" },
    ],
    licenseUrl:
      "https://raw.githubusercontent.com/cormullion/juliamono/v0.63.2/LICENSE",
  },
  {
    target: "xiaolai",
    id: "xiaolai-mono",
    family: "Xiaolai Mono",
    version: "3.126",
    binaryUrl:
      "https://github.com/lxgw/kose-font/releases/download/v3.126/" +
      "XiaolaiMono-Regular.ttf",
    binarySha256:
      "802b658db492e02ae5b659f5b56d7d4ef8f77609515bdcc82f462ae912888c33",
    fontFile: "XiaolaiMono-Regular.ttf",
    subsets: [
      {
        id: "base",
        file: "base.woff2",
        unicodeRange:
          "U+0000-33FF, U+4DC0-4DFF, U+A000-ABFF, U+D7B0-D7FF, U+E000-FFFF",
      },
      {
        id: "cjk-extension-a",
        file: "cjk-extension-a.woff2",
        unicodeRange: "U+3400-4DBF",
      },
      {
        id: "cjk-unified",
        file: "cjk-unified.woff2",
        unicodeRange: "U+4E00-9FFF",
      },
      {
        id: "hangul",
        file: "hangul.woff2",
        unicodeRange: "U+AC00-D7AF",
      },
      {
        id: "supplementary",
        file: "supplementary.woff2",
        unicodeRange: "U+10000-10FFFF",
      },
    ],
    licenseUrl:
      "https://raw.githubusercontent.com/lxgw/kose-font/v3.126/OFL.txt",
  },
];

const nerdSource = {
  target: "canvas-core",
  id: "symbols-nerd-font-mono",
  family: "Symbols Nerd Font Mono",
  version: "3.5.1",
  binaryUrl:
    "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.5.1/" +
    "patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFontMono-Regular.ttf",
  binarySha256:
    "fe471e538392f51910faab985fa8e192a39dd3426125edd15b71b3680df0e749",
  catalogUrl:
    "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.5.1/glyphnames.json",
  catalogSha256:
    "d2fa6615a38eb527462cb71ff17aa44b1d6453d437ed263ab8d5b458393669e8",
  licenseUrl:
    "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.5.1/LICENSE",
};

const archiveSources = [{
  target: "fusion",
  id: "fusion-mono",
  family: "Fusion Pixel 12px Mono latin",
  version: "2026.09.01",
  archiveUrl: "https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.09.01/fusion-pixel-font-12px-monospaced-ttf.woff2-v2026.09.01.zip",
  archiveSha256: "b264613025d57c793cab0cefc09ae83aa40caafb5155b818d1feb4136340ab66",
  fontFile: "fusion-pixel-12px-monospaced-latin.ttf.woff2",
  licenseFiles: [
    "OFL.txt",
    "LICENSES/ark-pixel/OFL.txt",
    "LICENSES/cubic-11/OFL.txt",
    "LICENSES/galmuri/LICENSE.txt",
  ],
}];

const sourceIdsForTarget = (targetId) => [
  ...binarySources.filter((source) => source.target === targetId).map(({ id }) => id),
  ...sources.filter((source) => source.target === targetId).map(({ id }) => id),
  ...archiveSources.filter((source) => source.target === targetId).map(({ id }) => id),
  ...(nerdSource.target === targetId ? [nerdSource.id] : []),
];

const sha256 = (content) =>
  createHash("sha256").update(content).digest("hex");

const fetchBytes = async (url, headers) => {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
};

const slugify = (value) => value.toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const unicodeRanges = (codePoints) => {
  const ranges = [];
  let start = codePoints[0];
  let end = start;
  for (const codePoint of codePoints.slice(1)) {
    if (codePoint === end + 1) {
      end = codePoint;
      continue;
    }
    ranges.push([start, end]);
    start = codePoint;
    end = codePoint;
  }
  if (start !== undefined) ranges.push([start, end]);
  return ranges.map(([from, to]) => from === to
    ? `U+${from.toString(16).toUpperCase()}`
    : `U+${from.toString(16).toUpperCase()}-${to.toString(16).toUpperCase()}`
  ).join(", ");
};

const parseUnicodeRange = (value) => value.split(",").map((part) => {
  const match = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/iu);
  if (!match) throw new Error(`Invalid unicode-range: ${part}`);
  const start = Number.parseInt(match[1], 16);
  return [start, Number.parseInt(match[2] ?? match[1], 16)];
});

const rangeContains = (ranges, codePoint) =>
  ranges.some(([start, end]) => codePoint >= start && codePoint <= end);

const vendorNerdFont = async (target, manifest, targetStylesheets) => {
  const [rawFont, rawCatalog] = await Promise.all([
    fetchBytes(nerdSource.binaryUrl),
    fetchBytes(nerdSource.catalogUrl),
  ]);
  if (sha256(rawFont) !== nerdSource.binarySha256) {
    throw new Error(`${nerdSource.id} no longer matches pinned binary checksum`);
  }
  if (sha256(rawCatalog) !== nerdSource.catalogSha256) {
    throw new Error(`${nerdSource.id} no longer matches pinned catalog checksum`);
  }
  const catalog = JSON.parse(rawCatalog.toString("utf8"));
  const catalogCodePoints = nerdFontCodePoints(catalog);
  const shards = await buildNerdFontSubsets({ catalog, fontBytes: rawFont });
  const sourceRelativeDir = path.posix.join(target.assetPrefix, nerdSource.id);
  const sourceDir = path.join(target.outputRoot, sourceRelativeDir);
  await mkdir(sourceDir, { recursive: true });
  const stylesheet = [];
  const shardCounts = new Map();
  for (const shard of shards) {
    shardCounts.set(shard.group, (shardCounts.get(shard.group) ?? 0) + 1);
  }
  const shardIndices = new Map();
  for (const shard of shards) {
      const index = (shardIndices.get(shard.group) ?? 0) + 1;
      shardIndices.set(shard.group, index);
      const suffix = shardCounts.get(shard.group) === 1
        ? ""
        : `-${String(index).padStart(2, "0")}`;
      const fileName = `${shard.group}${suffix}.woff2`;
      const outputPath = path.join(sourceDir, fileName);
      await writeFile(outputPath, shard.content);
      const relativePath = path.posix.join(sourceRelativeDir, fileName);
      manifest.assets.push({
        path: relativePath,
        size: shard.content.length,
        sha256: sha256(shard.content),
      });
      stylesheet.push(
        `/* ${shard.group}${suffix} */\n` +
        `@font-face {\n` +
        `  font-family: '${nerdSource.family}';\n` +
        `  font-style: normal;\n` +
        `  font-weight: 400;\n` +
        `  font-display: swap;\n` +
        `  src: url(./${relativePath}) format('woff2');\n` +
        `  unicode-range: ${unicodeRanges(shard.codePoints)};\n` +
        `}`
      );
  }
  const license = await fetchBytes(nerdSource.licenseUrl);
  const licensePath = path.posix.join(sourceRelativeDir, "LICENSE.txt");
  await writeFile(path.join(target.outputRoot, licensePath), license);
  manifest.assets.push({
    path: licensePath,
    size: license.length,
    sha256: sha256(license),
  });
  manifest.sources.push({
    id: nerdSource.id,
    family: nerdSource.family,
    version: nerdSource.version,
    binary: nerdSource.binaryUrl,
    binarySha256: nerdSource.binarySha256,
    catalog: nerdSource.catalogUrl,
    catalogSha256: nerdSource.catalogSha256,
    license: nerdSource.licenseUrl,
  });
  manifest.nerdCatalogCodePoints = catalogCodePoints.size;
  manifest.nerdCatalogEntries = Object.keys(catalog).length - 1;
  manifest.nerdMaxShardBytes = Math.max(...shards.map(({ content }) => content.length));
  targetStylesheets.push(
    `/* ${nerdSource.family} ${nerdSource.version} */\n${stylesheet.join("\n\n")}`
  );
  return { catalog, rawCatalog };
};

const verifyTarget = async ([targetId, target]) => {
  const manifestPath = path.join(target.outputRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const failures = [];
  const expectedSourceIds = sourceIdsForTarget(targetId);

  for (const { target: binaryTarget, ...pinned } of binarySources) {
    if (binaryTarget !== targetId) continue;
    const recorded = manifest.sources.find(({ id }) => id === pinned.id);
    if (JSON.stringify(recorded) !== JSON.stringify(pinned)) {
      failures.push(`${pinned.id}: source differs from pinned binary`);
    }
  }

  for (const { target: archiveTarget, ...pinned } of archiveSources) {
    if (archiveTarget !== targetId) continue;
    const recorded = manifest.sources.find(({ id }) => id === pinned.id);
    if (JSON.stringify(recorded) !== JSON.stringify(pinned)) {
      failures.push(`${pinned.id}: source differs from pinned release`);
    }
  }

  if (nerdSource.target === targetId) {
    const expected = {
      id: nerdSource.id,
      family: nerdSource.family,
      version: nerdSource.version,
      binary: nerdSource.binaryUrl,
      binarySha256: nerdSource.binarySha256,
      catalog: nerdSource.catalogUrl,
      catalogSha256: nerdSource.catalogSha256,
      license: nerdSource.licenseUrl,
    };
    const recorded = manifest.sources.find(({ id }) => id === nerdSource.id);
    if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
      failures.push(`${nerdSource.id}: source differs from pinned release`);
    }
  }

  if (manifest.target !== targetId) {
    failures.push(`manifest target: expected ${targetId}`);
  }
  if (target.profileId && manifest.profileId !== target.profileId) {
    failures.push(`manifest profile: expected ${target.profileId}`);
  }
  if (
    JSON.stringify(manifest.sources.map((source) => source.id)) !==
    JSON.stringify(expectedSourceIds)
  ) {
    failures.push(
      `manifest sources: expected ${expectedSourceIds.join(", ")}`
    );
  }

  for (const asset of manifest.assets) {
    const assetPath = path.join(target.outputRoot, asset.path);
    try {
      const content = await readFile(assetPath);
      if (content.length !== asset.size || sha256(content) !== asset.sha256) {
        failures.push(`${asset.path}: checksum mismatch`);
      }
    } catch {
      failures.push(`${asset.path}: missing`);
    }
  }

  const stylesheet = await readFile(
    path.join(target.outputRoot, "fonts.css"),
    "utf8"
  );
  if (/url\((?:["']?)https?:/u.test(stylesheet)) {
    failures.push("fonts.css: remote URL");
  }
  const stylesheetAssets = new Set(Array.from(
    stylesheet.matchAll(/url\((?:["']?)\.\/([^)'\"]+)(?:["']?)\)/g),
    (match) => match[1]
  ));
  const manifestAssets = new Set(manifest.assets.map(({ path: assetPath }) => assetPath));
  for (const assetPath of stylesheetAssets) {
    if (!manifestAssets.has(assetPath)) {
      failures.push(`fonts.css: untracked asset ${assetPath}`);
    }
  }
  for (const { path: assetPath } of manifest.assets) {
    if (assetPath.endsWith(".woff2") && !stylesheetAssets.has(assetPath)) {
      failures.push(`fonts.css: missing asset ${assetPath}`);
    }
  }

  if (nerdSource.target === targetId) {
    const nerdAssets = manifest.assets.filter(({ path: assetPath }) =>
      assetPath.startsWith(`${target.assetPrefix}/${nerdSource.id}/`) &&
      assetPath.endsWith(".woff2")
    );
    const maxShardBytes = Math.max(...nerdAssets.map(({ size }) => size));
    if (manifest.nerdCatalogCodePoints !== 10_617) {
      failures.push("Nerd catalog: expected 10617 code points");
    }
    if (manifest.nerdCatalogEntries !== 10_995) {
      failures.push("Nerd catalog: expected 10995 entries");
    }
    if (maxShardBytes > 96 * 1024 || manifest.nerdMaxShardBytes !== maxShardBytes) {
      failures.push(`Nerd shards: invalid maximum ${maxShardBytes}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Font asset verification failed for ${targetId}:\n${failures.join("\n")}`
    );
  }
  console.log(
    `Verified ${manifest.assets.length} self-hosted ${targetId} font assets.`
  );
};

const verifyAssets = async () => {
  await Promise.all(targetEntries.map(verifyTarget));
};

const vendorBinaryFont = async (source, target, manifest, stylesheets) => {
  const font = await fetchBytes(source.binaryUrl);
  if (sha256(font) !== source.binarySha256) {
    throw new Error(`${source.id}: binary checksum mismatch`);
  }
  const relativeDir = path.posix.join(target.assetPrefix, source.id);
  await mkdir(path.join(target.outputRoot, relativeDir), { recursive: true });
  if (source.subsets) {
    const parsedSubsets = source.subsets.map((subset) => ({
      ...subset,
      ranges: parseUnicodeRange(subset.unicodeRange),
    }));
    const sourceCodePoints = createFont(font).characterSet;
    for (const codePoint of sourceCodePoints) {
      const owners = parsedSubsets.filter(({ ranges }) =>
        rangeContains(ranges, codePoint));
      if (owners.length !== 1) {
        throw new Error(
          `${source.id}: U+${codePoint.toString(16).toUpperCase()} belongs to ` +
          `${owners.length} subsets`
        );
      }
    }

    const temporaryRoot = await mkdtemp(path.join(tmpdir(), `chardesk-${source.id}-`));
    const inputPath = path.join(temporaryRoot, source.fontFile);
    await writeFile(inputPath, font);
    try {
      for (const subset of parsedSubsets) {
        const relativeFontPath = path.posix.join(relativeDir, subset.file);
        const outputPath = path.join(target.outputRoot, relativeFontPath);
        try {
          await runPyftsubset([
            inputPath,
            `--output-file=${outputPath}`,
            "--flavor=woff2",
            `--unicodes=${subset.unicodeRange.replaceAll(" ", "")}`,
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
          ]);
        } catch (error) {
          throw new Error(
            `${source.id} subsetting requires FontTools pyftsubset with Brotli ` +
            `(set PYFTSUBSET to its executable path): ${error.message}`
          );
        }
        const content = await readFile(outputPath);
        const subsetCodePoints = new Set(createFont(content).characterSet);
        for (const codePoint of sourceCodePoints) {
          if (
            rangeContains(subset.ranges, codePoint) &&
            !subsetCodePoints.has(codePoint)
          ) {
            throw new Error(
              `${source.id}/${subset.id}: missing U+${codePoint.toString(16).toUpperCase()}`
            );
          }
        }
        manifest.assets.push({
          path: relativeFontPath,
          size: content.length,
          sha256: sha256(content),
        });
        stylesheets.push(
          `/* ${source.family} ${source.version}: ${subset.id} */\n` +
          `@font-face {\n` +
          `  font-family: '${source.family}';\n` +
          `  font-style: normal;\n` +
          `  font-weight: 400;\n` +
          `  font-display: swap;\n` +
          `  src: url(./${relativeFontPath}) format('woff2');\n` +
          `  unicode-range: ${subset.unicodeRange};\n` +
          `}`
        );
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  } else {
    const relativeFontPath = path.posix.join(relativeDir, source.fontFile);
    await writeFile(path.join(target.outputRoot, relativeFontPath), font);
    manifest.assets.push({
      path: relativeFontPath,
      size: font.length,
      sha256: sha256(font),
    });
    stylesheets.push(
      `/* ${source.family} ${source.version} */\n` +
      `@font-face {\n` +
      `  font-family: '${source.family}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: 400;\n` +
      `  font-display: swap;\n` +
      `  src: url(./${relativeFontPath}) format('woff2');\n` +
      `}`
    );
  }

  const license = await fetchBytes(source.licenseUrl);
  const relativeLicensePath = path.posix.join(relativeDir, "OFL.txt");
  await writeFile(path.join(target.outputRoot, relativeLicensePath), license);
  manifest.assets.push({
    path: relativeLicensePath,
    size: license.length,
    sha256: sha256(license),
  });

  const { target: _target, ...metadata } = source;
  manifest.sources.push(metadata);
};

const vendorArchiveFont = async (source, target, manifest, stylesheets) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "chardesk-font-archive-"));
  try {
    const archive = await fetchBytes(source.archiveUrl);
    if (sha256(archive) !== source.archiveSha256) {
      throw new Error(`${source.id}: archive checksum mismatch`);
    }
    const archivePath = path.join(scratch, "font.zip");
    await writeFile(archivePath, archive);
    const relativeDir = path.posix.join(target.assetPrefix, source.id);
    await mkdir(path.join(target.outputRoot, relativeDir), { recursive: true });
    for (const member of [source.fontFile, ...source.licenseFiles]) {
      // Extract only pinned members to stdout, never archive-controlled paths.
      const { stdout } = await execFileAsync("unzip", ["-p", archivePath, member], {
        encoding: "buffer", maxBuffer: 16 * 1024 * 1024,
      });
      const relativePath = path.posix.join(relativeDir, member);
      const outputPath = path.join(target.outputRoot, relativePath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, stdout);
      manifest.assets.push({ path: relativePath, size: stdout.length, sha256: sha256(stdout) });
    }
    stylesheets.push(`/* ${source.family} ${source.version} */\n@font-face {\n  font-family: "${source.family}";\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url("./${relativeDir}/${source.fontFile}") format("woff2");\n}`);
    const { target: _target, ...metadata } = source;
    manifest.sources.push(metadata);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const withWorkingRoots = async (task) => {
  const workingRoots = new Map();
  try {
    return await task(workingRoots);
  } finally {
    await Promise.all(
      [...workingRoots.values()].map((workingRoot) =>
        rm(workingRoot, { recursive: true, force: true })
      )
    );
  }
};

const vendorAssets = async () => withWorkingRoots(async (workingRoots) => {
  const manifests = new Map();
  const stylesheets = new Map();
  let generatedNerdCatalog;

  for (const [targetId, target] of targetEntries) {
    await mkdir(path.dirname(target.outputRoot), { recursive: true });
    const workingRoot = await mkdtemp(
      path.join(path.dirname(target.outputRoot), `.font-sync-${targetId}-`)
    );
    workingRoots.set(targetId, workingRoot);
    if (nerdOnly) {
      await cp(
        path.join(target.outputRoot, target.assetPrefix),
        path.join(workingRoot, target.assetPrefix),
        { recursive: true }
      );
      await rm(
        path.join(workingRoot, target.assetPrefix, nerdSource.id),
        { recursive: true, force: true }
      );
      const manifest = JSON.parse(await readFile(
        path.join(target.outputRoot, "manifest.json"),
        "utf8"
      ));
      manifests.set(targetId, {
        ...manifest,
        profileId: target.profileId,
        generatedAt: new Date().toISOString(),
        sources: manifest.sources.filter(({ id }) => id !== nerdSource.id),
        assets: manifest.assets.filter(({ path: assetPath }) =>
          assetPath !== "fonts.css" &&
          !assetPath.startsWith(`${target.assetPrefix}/${nerdSource.id}/`)
        ),
      });
      const stylesheet = await readFile(
        path.join(target.outputRoot, "fonts.css"),
        "utf8"
      );
      const nerdMarkers = [
        stylesheet.indexOf(`/* ${nerdSource.family} `),
        stylesheet.indexOf("/* Nerd Fonts:"),
      ].filter((index) => index >= 0);
      const nerdStart = nerdMarkers.length > 0
        ? Math.min(...nerdMarkers)
        : stylesheet.length;
      stylesheets.set(targetId, [
        stylesheet.slice(0, nerdStart).trim(),
      ]);
      continue;
    }
    await mkdir(path.join(workingRoot, target.assetPrefix), { recursive: true });
    manifests.set(targetId, {
      target: targetId,
      ...(target.profileId ? { profileId: target.profileId } : {}),
      generatedAt: new Date().toISOString(),
      sources: [],
      assets: [],
    });
    stylesheets.set(targetId, []);
  }

  for (const source of binarySources) {
    if (nerdOnly) continue;
    if (requestedTarget && source.target !== requestedTarget) continue;
    await vendorBinaryFont(
      source,
      { ...targets[source.target], outputRoot: workingRoots.get(source.target) },
      manifests.get(source.target),
      stylesheets.get(source.target)
    );
  }

  for (const source of sources) {
    if (nerdOnly) continue;
    if (requestedTarget && source.target !== requestedTarget) continue;
    const target = targets[source.target];
    const outputRoot = workingRoots.get(source.target);
    const manifest = manifests.get(source.target);
    const targetStylesheets = stylesheets.get(source.target);
    const sourceRelativeDir = path.posix.join(target.assetPrefix, source.id);
    const sourceDir = path.join(outputRoot, sourceRelativeDir);
    await mkdir(sourceDir, { recursive: true });
    const cssBytes = await fetchBytes(source.cssUrl, source.headers);
    let css = cssBytes.toString("utf8");
    if (!css.includes(source.family) || !css.includes(source.versionMarker)) {
      throw new Error(
        `${source.id} no longer matches pinned version ${source.version}`
      );
    }

    const remoteUrls = [
      ...new Set(
        Array.from(
          css.matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/g),
          (match) => match[1].trim()
        )
      ),
    ];

    for (const remoteUrl of remoteUrls) {
      const absoluteUrl = new URL(remoteUrl, source.cssUrl).href;
      const fileName = path.basename(new URL(absoluteUrl).pathname);
      const relativePath = path.posix.join(sourceRelativeDir, fileName);
      const content = await fetchBytes(absoluteUrl, source.headers);
      await writeFile(path.join(outputRoot, relativePath), content);
      manifest.assets.push({
        path: relativePath,
        size: content.length,
        sha256: sha256(content),
      });
      css = css.replaceAll(remoteUrl, `./${relativePath}`);
    }

    // A locally installed font may be another version. Always use vendored bytes.
    css = css.replaceAll(/src:local\([^)]*\),/g, "src:");
    targetStylesheets.push(
      `/* ${source.family} ${source.version} */\n${css.trim()}`
    );

    const rawLicense = await fetchBytes(source.licenseUrl);
    const license = Buffer.from(
      rawLicense.toString("utf8").replace(/[ \t]+(?=\r?\n)/g, "")
    );
    const licensePath = path.posix.join(sourceRelativeDir, "OFL.txt");
    await writeFile(path.join(outputRoot, licensePath), license);
    manifest.assets.push({
      path: licensePath,
      size: license.length,
      sha256: sha256(license),
    });
    manifest.sources.push({
      id: source.id,
      family: source.family,
      version: source.version,
      stylesheet: source.cssUrl,
      stylesheetSha256: sha256(cssBytes),
      license: source.licenseUrl,
    });
  }

  for (const source of archiveSources) {
    if (nerdOnly) continue;
    if (requestedTarget && source.target !== requestedTarget) continue;
    await vendorArchiveFont(
      source,
      { ...targets[source.target], outputRoot: workingRoots.get(source.target) },
      manifests.get(source.target),
      stylesheets.get(source.target)
    );
  }

  if (!requestedTarget || requestedTarget === nerdSource.target) {
    const target = targets[nerdSource.target];
    generatedNerdCatalog = await vendorNerdFont(
      { ...target, outputRoot: workingRoots.get(nerdSource.target) },
      manifests.get(nerdSource.target),
      stylesheets.get(nerdSource.target)
    );
  }

  for (const [targetId, target] of targetEntries) {
    const workingRoot = workingRoots.get(targetId);
    const manifest = manifests.get(targetId);
    const stylesheet = `${stylesheets.get(targetId).join("\n\n")}\n`;
    await writeFile(
      path.join(workingRoot, "fonts.css"),
      stylesheet,
      "utf8"
    );
    manifest.assets.push({
      path: "fonts.css",
      size: Buffer.byteLength(stylesheet),
      sha256: sha256(stylesheet),
    });
    manifest.assets.sort((left, right) => left.path.localeCompare(right.path));
    await writeFile(
      path.join(workingRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    console.log(
      `Vendored ${manifest.assets.length} assets for ${targetId} from ${manifest.sources.length} pinned sources.`
    );
  }

  for (const [targetId, target] of targetEntries) {
    const workingRoot = workingRoots.get(targetId);
    await verifyTarget([targetId, { ...target, outputRoot: workingRoot }]);
  }

  for (const [targetId, target] of targetEntries) {
    const workingRoot = workingRoots.get(targetId);
    if (targetId === "app-ui") {
      await rm(target.outputRoot, { recursive: true, force: true });
      await rename(workingRoot, target.outputRoot);
      continue;
    }
    await rm(path.join(target.outputRoot, target.assetPrefix), {
      recursive: true,
      force: true,
    });
    await rm(path.join(target.outputRoot, "fonts.css"), { force: true });
    await rm(path.join(target.outputRoot, "manifest.json"), { force: true });
    await rename(
      path.join(workingRoot, target.assetPrefix),
      path.join(target.outputRoot, target.assetPrefix)
    );
    await rename(
      path.join(workingRoot, "fonts.css"),
      path.join(target.outputRoot, "fonts.css")
    );
    await rename(
      path.join(workingRoot, "manifest.json"),
      path.join(target.outputRoot, "manifest.json")
    );
    await rm(workingRoot, { recursive: true, force: true });
  }

  if (generatedNerdCatalog) {
    await writeFile(
      path.join(repoRoot, "scripts", "data", "sources", "nerdfonts.json"),
      generatedNerdCatalog.rawCatalog
    );
    await writeFile(
      path.join(
        repoRoot,
        "packages",
        "fonts",
        "src",
        "generated",
        "nerd-font-ranges.ts"
      ),
      formatNerdFontRangesModule(generatedNerdCatalog.catalog),
      "utf8"
    );
  }
});

if (verifyOnly) {
  await verifyAssets();
} else {
  await vendorAssets();
  await verifyAssets();
}
