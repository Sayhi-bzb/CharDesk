import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);
const verifyOnly = process.argv.includes("--verify");
const targetArgument = process.argv.find((argument) =>
  argument.startsWith("--target=")
);
const requestedTarget = targetArgument?.slice("--target=".length);
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
    profileId: "chardesk/system-v1",
  },
  maple: {
    outputRoot: path.join(repoRoot, "packages", "font-maple"),
    assetPrefix: "assets",
    profileId: "chardesk/maple-v1",
  },
};

if (requestedTarget && !Object.hasOwn(targets, requestedTarget)) {
  throw new Error(`Unknown font target: ${requestedTarget}`);
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
    id: "noto-sans-symbols-2",
    family: "Noto Sans Symbols 2",
    version: "google-fonts-v25",
    cssUrl:
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols+2&display=swap",
    versionMarker: "/notosanssymbols2/v25/",
    licenseUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssymbols2/OFL.txt",
    headers: { "User-Agent": browserUserAgent },
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

const nerdSource = {
  target: "canvas-core",
  id: "symbols-nerd-font-mono",
  family: "Symbols Nerd Font Mono",
  version: "3.5.0",
  binaryUrl:
    "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.5.0/" +
    "patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFontMono-Regular.ttf",
  binarySha256:
    "2dc316f2505a0cbfbcf6060a1b4ba85b0a2974189e30c0037cdedc436a25a4ff",
  licenseUrl:
    "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.5.0/LICENSE",
};

const sourceIdsForTarget = (targetId) => [
  ...sources.filter((source) => source.target === targetId).map(({ id }) => id),
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

const vendorNerdFont = async (target, manifest, targetStylesheets) => {
  const rawFont = await fetchBytes(nerdSource.binaryUrl);
  if (sha256(rawFont) !== nerdSource.binarySha256) {
    throw new Error(`${nerdSource.id} no longer matches pinned binary checksum`);
  }
  const catalog = JSON.parse(await readFile(
    path.join(repoRoot, "scripts", "data", "sources", "nerdfonts.json"),
    "utf8"
  ));
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "chardesk-nerd-font-"));
  const inputPath = path.join(temporaryRoot, "SymbolsNerdFontMono-Regular.ttf");
  await writeFile(inputPath, rawFont);
  const sourceRelativeDir = path.posix.join(target.assetPrefix, nerdSource.id);
  const sourceDir = path.join(target.outputRoot, sourceRelativeDir);
  await mkdir(sourceDir, { recursive: true });
  const seen = new Set();
  const stylesheet = [];
  const subsetCommand = process.env.PYFTSUBSET || "pyftsubset";
  try {
    for (const [group, entries] of Object.entries(catalog)) {
      const codePoints = [];
      for (const { char } of entries) {
        for (const character of char) {
          const codePoint = character.codePointAt(0);
          if (codePoint === undefined || seen.has(codePoint)) continue;
          seen.add(codePoint);
          codePoints.push(codePoint);
        }
      }
      codePoints.sort((left, right) => left - right);
      if (codePoints.length === 0) continue;
      const fileName = `${slugify(group)}.woff2`;
      const outputPath = path.join(sourceDir, fileName);
      try {
        await execFileAsync(subsetCommand, [
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
        ]);
      } catch (error) {
        throw new Error(
          `Nerd Font subsetting requires FontTools pyftsubset with Brotli ` +
          `(set PYFTSUBSET to its executable path): ${error.message}`
        );
      }
      const content = await readFile(outputPath);
      const relativePath = path.posix.join(sourceRelativeDir, fileName);
      manifest.assets.push({
        path: relativePath,
        size: content.length,
        sha256: sha256(content),
      });
      stylesheet.push(
        `/* ${group} */\n` +
        `@font-face {\n` +
        `  font-family: '${nerdSource.family}';\n` +
        `  font-style: normal;\n` +
        `  font-weight: 400;\n` +
        `  font-display: swap;\n` +
        `  src: url(./${relativePath}) format('woff2');\n` +
        `  unicode-range: ${unicodeRanges(codePoints)};\n` +
        `}`
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
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
    license: nerdSource.licenseUrl,
  });
  targetStylesheets.push(
    `/* ${nerdSource.family} ${nerdSource.version} */\n${stylesheet.join("\n\n")}`
  );
};

const verifyTarget = async ([targetId, target]) => {
  const manifestPath = path.join(target.outputRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const failures = [];
  const expectedSourceIds = sourceIdsForTarget(targetId);

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

const vendorAssets = async () => {
  const manifests = new Map();
  const stylesheets = new Map();
  const workingRoots = new Map();

  for (const [targetId, target] of targetEntries) {
    await mkdir(path.dirname(target.outputRoot), { recursive: true });
    const workingRoot = await mkdtemp(
      path.join(path.dirname(target.outputRoot), `.font-sync-${targetId}-`)
    );
    workingRoots.set(targetId, workingRoot);
    await mkdir(
      path.join(workingRoot, target.assetPrefix),
      { recursive: true }
    );
    manifests.set(targetId, {
      target: targetId,
      ...(target.profileId ? { profileId: target.profileId } : {}),
      generatedAt: new Date().toISOString(),
      sources: [],
      assets: [],
    });
    stylesheets.set(targetId, []);
  }

  for (const source of sources) {
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

  if (!requestedTarget || requestedTarget === nerdSource.target) {
    const target = targets[nerdSource.target];
    await vendorNerdFont(
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
};

if (verifyOnly) {
  await verifyAssets();
} else {
  await vendorAssets();
  await verifyAssets();
}
