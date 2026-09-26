import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = path.resolve("apps/canvas/src");
const ADAPTER_ALLOWLIST = new Set([
  "domains/collaboration/runtime.ts",
  "domains/canvas/state/editorStore.ts",
]);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

const violations = [];
for (const absolute of collect(SRC_ROOT)) {
  const sourcePath = path.relative(SRC_ROOT, absolute).replaceAll("\\", "/");
  if (/\.(?:test|spec)\.[tj]sx?$/.test(sourcePath) || ADAPTER_ALLOWLIST.has(sourcePath)) continue;
  const sourceText = fs.readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  function inspect(node) {
    if (
      ts.isAsExpression(node) &&
      (node.type.kind === ts.SyntaxKind.NeverKeyword || ts.isAsExpression(node.expression))
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(`${sourcePath}:${location.line + 1}: unsafe assertion escape`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

if (violations.length > 0) {
  console.error("Type escape violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Production type escapes are confined to adapters.");
