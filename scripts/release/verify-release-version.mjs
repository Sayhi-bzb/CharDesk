import fs from "node:fs";

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
const packages = [
  { name: "@chardesk/cli", path: "packages/cli" },
  { name: "@chardesk/cell-core", path: "packages/cell-core" },
  { name: "@chardesk/fonts", path: "packages/fonts" },
  { name: "@chardesk/font-maple", path: "packages/font-maple" },
  { name: "@chardesk/protocol", path: "packages/protocol" },
];
const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

for (const descriptor of packages) {
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

console.log(
  `${tag ? `Release ${tag}` : `Release metadata ${version}`} matches all public packages and package-lock.json.`
);
