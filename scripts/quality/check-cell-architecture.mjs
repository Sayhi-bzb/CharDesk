import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { checkCellArchitecture } from "./cell-architecture-rules.mjs";

const root = process.cwd();
const sourceRoots = [join(root, "packages"), join(root, "src")];

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" ? [] : collect(absolute);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [absolute] : [];
  });
}

const targets = [
  join(root, "packages", "cell-core", "package.json"),
  ...sourceRoots.flatMap(collect),
];
const violations = targets.flatMap((absolute) => checkCellArchitecture(
  readFileSync(absolute, "utf8"),
  relative(root, absolute).replaceAll("\\", "/")
));

if (violations.length > 0) {
  console.error("Cell architecture violations:\n" + violations
    .map(({ file, message }) => `${file}: ${message}`)
    .join("\n"));
  process.exit(1);
}
console.log("Cell architecture is valid.");
