import fs from "node:fs";
import { compatibleRange, dependencyFields, releasedPackages } from "./workspace-packages.mjs";

const tag = process.argv[2];
const releaseVersion = fs.readFileSync("version.txt", "utf8").trim();
const releaseManifest = JSON.parse(
  fs.readFileSync(".release-please-manifest.json", "utf8")
);
const match = tag
  ? /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag)
  : null;

if (tag && !match) {
  throw new Error(
    `Release tag must be a stable SemVer tag such as v0.1.0; received ${tag ?? "<missing>"}`
  );
}

const version = match ? tag.slice(1) : releaseVersion;

if (releaseManifest["."] !== version) {
  throw new Error(
    `Release manifest version ${releaseManifest["."] ?? "<missing>"} does not match ${version}`
  );
}
const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const releasedNames = new Set(releasedPackages.map(({ name }) => name));
const expectedRange = compatibleRange(version);

for (const descriptor of releasedPackages) {
  const manifest = JSON.parse(
    fs.readFileSync(`${descriptor.path}/package.json`, "utf8")
  );
  if (manifest.name !== descriptor.name) {
    throw new Error(
      `${descriptor.path}/package.json must be named ${descriptor.name}; received ${manifest.name}`
    );
  }
  if (manifest.version !== version) {
    throw new Error(
      `${descriptor.name} version ${manifest.version} does not match ${version}`
    );
  }

  const locked = lockfile.packages?.[descriptor.path];
  if (locked?.version !== version) {
    throw new Error(
      `${descriptor.name} lockfile version ${locked?.version ?? "<missing>"} does not match ${version}`
    );
  }
}

for (const directory of fs.readdirSync("packages", { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const manifestPath = `packages/${directory.name}/package.json`;
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const field of dependencyFields) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (releasedNames.has(dependency) && range !== `^${version}` && range !== expectedRange && range !== "*") {
        throw new Error(`${manifest.name} requires ${dependency}@${range}; expected ^${version}, ${expectedRange}, or *`);
      }
    }
  }
}

console.log(
  `${tag ? `Release ${tag}` : `Release metadata ${version}`} matches all public packages and package-lock.json.`
);
