import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compatibleRange, dependencyFields, releasedPackages } from "./workspace-packages.mjs";

const releasedNames = new Set(releasedPackages.map(({ name }) => name));

export function syncManifestDependencies(manifest, version) {
  const expectedRange = compatibleRange(version);
  let changed = false;
  for (const field of dependencyFields) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!releasedNames.has(name) || range === "*" || range === expectedRange) continue;
      manifest[field][name] = expectedRange;
      changed = true;
    }
  }
  return changed;
}

function main() {
  const version = fs.readFileSync("version.txt", "utf8").trim();
  for (const directory of fs.readdirSync("packages", { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const manifestPath = path.join("packages", directory.name, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!syncManifestDependencies(manifest, version)) continue;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Updated ${manifestPath}`);
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const [command, args] of [
    [npm, ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]],
    [process.execPath, ["scripts/cell-ui/generate-registry.mjs"]],
  ]) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
