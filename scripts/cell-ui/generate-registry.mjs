import { readFile, readdir, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(repoRoot, "packages/cell-ui/src");
const keyboardRoot = path.join(repoRoot, "packages/keyboard/src");
const generatedRoot = path.join(repoRoot, "registry/cell-ui");
const registryPath = path.join(repoRoot, "registry.json");
const verify = process.argv.includes("--verify");

const packageJson = JSON.parse(await readFile(path.join(repoRoot, "packages/cell-ui/package.json"), "utf8"));
const dependencies = Object.entries(packageJson.dependencies)
  .filter(([name]) => name !== "@chardesk/keyboard")
  .map(([name, version]) => `${name}@${version}`);
const allowedPackages = new Set([
  ...Object.keys(packageJson.dependencies).filter((name) => name !== "@chardesk/keyboard"),
  ...Object.keys(packageJson.peerDependencies),
]);

const sourceFiles = (await readdir(sourceRoot))
  .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.|\.dom\./u.test(file))
  .sort();
const generated = new Map();
const moduleFiles = new Set([
  ...sourceFiles,
  "keyboard/index.ts",
  "keyboard/browser.ts",
]);

const sourceModules = (source, file) => {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error(`Cannot parse ${file}`);
  const edits = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      let replacement = specifier;
      if (file.startsWith("keyboard/")) {
        if (!specifier.startsWith(".")) throw new Error(`Unexpected keyboard dependency: ${file}: ${specifier}`);
      } else if (specifier === "@chardesk/keyboard") {
        replacement = "./keyboard/index.js";
      } else if (specifier === "@chardesk/keyboard/browser") {
        replacement = "./keyboard/browser.js";
      }
      if (replacement.startsWith(".")) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), replacement))
          .replace(/\.js$/u, ".ts");
        if (!moduleFiles.has(resolved) && !moduleFiles.has(resolved.replace(/\.ts$/u, ".tsx"))) {
          throw new Error(`Missing Registry module: ${file}: ${replacement}`);
        }
      } else if (replacement.startsWith("@chardesk/")) {
        const packageName = replacement.split("/").slice(0, 2).join("/");
        if (!allowedPackages.has(packageName)) throw new Error(`Undeclared Registry dependency: ${file}: ${replacement}`);
      }
      if (replacement !== specifier) edits.push({
        start: node.moduleSpecifier.getStart(parsed) + 1,
        end: node.moduleSpecifier.getEnd() - 1,
        replacement,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return edits.reverse().reduce((text, edit) =>
    text.slice(0, edit.start) + edit.replacement + text.slice(edit.end), source);
};

for (const file of sourceFiles) {
  const source = await readFile(path.join(sourceRoot, file), "utf8");
  generated.set(file, sourceModules(source, file));
}
for (const file of ["index.ts", "browser.ts"]) {
  const source = await readFile(path.join(keyboardRoot, file), "utf8");
  generated.set(`keyboard/${file}`, sourceModules(source, `keyboard/${file}`));
}

const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "cell-ui",
  homepage: "https://ui.chardesk.com/",
  items: [{
    name: "cell-ui",
    type: "registry:item",
    title: "Cell UI",
    description: "Editable headless and browser Cell UI source.",
    dependencies,
    files: [...generated.keys()].map((file) => ({
      path: `registry/cell-ui/${file}`,
      type: "registry:file",
      target: `@lib/cell-ui/${file}`,
    })),
  }],
};
const expectedRegistry = `${JSON.stringify(registry, null, 2)}\n`;
if (!verify) await mkdir(path.join(generatedRoot, "keyboard"), { recursive: true });
const actualFiles = (await readdir(generatedRoot, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(generatedRoot, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, "/"))
  .sort();

if (verify) {
  if (JSON.stringify(actualFiles) !== JSON.stringify([...generated.keys()].sort())) {
    throw new Error("Registry file list is stale; run npm run cell-ui:registry:generate.");
  }
  for (const [file, expected] of generated) {
    if (await readFile(path.join(generatedRoot, file), "utf8") !== expected) {
      throw new Error(`Registry file is stale: ${file}`);
    }
  }
  if (await readFile(registryPath, "utf8") !== expectedRegistry) {
    throw new Error("registry.json is stale; run npm run cell-ui:registry:generate.");
  }
  console.log(`Verified Registry: ${generated.size} source files.`);
} else {
  for (const file of actualFiles) {
    if (!generated.has(file)) await unlink(path.join(generatedRoot, file));
  }
  for (const [file, content] of generated) await writeFile(path.join(generatedRoot, file), content);
  await writeFile(registryPath, expectedRegistry);
  console.log(`Generated Registry: ${generated.size} source files.`);
}
