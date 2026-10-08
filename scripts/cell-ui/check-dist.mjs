import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const packageRoot = path.join(root, "packages/cell-ui");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const missing = [];
for (const entry of Object.values(packageJson.exports)) {
  for (const field of ["types", "import"]) {
    const relative = entry?.[field];
    if (!relative) continue;
    try { await access(path.join(packageRoot, relative)); }
    catch { missing.push(relative); }
  }
}
if (missing.length) {
  console.error(`Cell UI dist is missing: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Cell UI dist exports are present.");
}
