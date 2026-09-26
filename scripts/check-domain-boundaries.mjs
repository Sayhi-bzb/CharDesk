import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = path.resolve("apps/canvas/src");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set(["__tests__", "test"]);
const FORBIDDEN_SHARED_DOMAIN_NAME = /^Structured/;
const WORKER_SAFE_DOMAIN_IMPORTS = new Set([
  "domains/canvas/cell-plane/model",
]);

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(absolutePath));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

function toSourcePath(absolutePath) {
  return path.relative(SRC_ROOT, absolutePath).replaceAll("\\", "/");
}

function resolveImport(sourceFile, specifier) {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (!specifier.startsWith(".")) return null;
  return path
    .normalize(path.join(path.dirname(toSourcePath(sourceFile)), specifier))
    .replaceAll("\\", "/");
}

function describeLocation(sourcePath) {
  const segments = sourcePath.split("/");
  if (segments[0] === "shared") return { layer: "shared", domain: null };
  if (segments[0] === "domains") return { layer: "domains", domain: segments[1] ?? null };
  if (segments[0] === "widgets") return { layer: "widgets", domain: null };
  return { layer: "app", domain: null };
}

function validateDependency(sourcePath, targetPath, isTestFile) {
  const source = describeLocation(sourcePath);
  const target = describeLocation(targetPath);

  if (source.layer === "shared" && target.layer !== "shared") {
    return "shared may only depend on shared";
  }
  if (source.layer === "domains" && ["widgets", "app"].includes(target.layer)) {
    return "domains may not depend on widgets or app";
  }
  if (source.layer === "widgets" && target.layer === "app") {
    return "widgets may not depend on app";
  }
  if (
    !isTestFile &&
    source.layer === "domains" &&
    source.domain === target.domain &&
    targetPath.split("/")[2] === "public"
  ) {
    return "a domain must import its owner source directly, not its own public.ts";
  }
  if (target.layer === "domains" && source.domain !== target.domain) {
    const segments = targetPath.split("/");
    if (isTestFile && segments[2] === "testing") return null;
    if (
      sourcePath.endsWith(".worker.ts") &&
      WORKER_SAFE_DOMAIN_IMPORTS.has(targetPath)
    ) return null;
    if (segments[2] !== "public") return "cross-domain imports must use public.ts";
  }
  return null;
}

const violations = [];
const domainEdges = new Map();
for (const absolutePath of collectSourceFiles(SRC_ROOT)) {
  const sourcePath = toSourcePath(absolutePath);
  const isTestFile = /\.(?:test|spec)\.[tj]sx?$/.test(sourcePath);
  const sourceText = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const editorStoreBindings = new Set();

  function inspect(node) {
    const isDomainPublicContract = /^domains\/[^/]+\/public\.[tj]sx?$/.test(sourcePath);
    if (isDomainPublicContract && ts.isImportDeclaration(node)) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${sourcePath}:${location.line + 1}: public contracts may only re-export; composition belongs in app`
      );
    }
    if (
      isDomainPublicContract &&
      ts.isExportDeclaration(node) &&
      !node.exportClause
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${sourcePath}:${location.line + 1}: public contracts require explicit named exports`
      );
    }
    if (sourcePath.startsWith("shared/")) {
      const isExported = node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
      const name = "name" in node && node.name && ts.isIdentifier(node.name)
        ? node.name.text
        : null;
      if (isExported && name && FORBIDDEN_SHARED_DOMAIN_NAME.test(name)) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push(
          `${sourcePath}:${location.line + 1}: shared may not own domain symbol ${name}`
        );
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      const targetPath = resolveImport(absolutePath, node.moduleSpecifier.text);
      if (
        targetPath === "domains/canvas/public" ||
        targetPath === "domains/canvas/testing" ||
        targetPath === "domains/canvas/state/editorStore"
      ) {
        for (const element of node.importClause.namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === "useEditorStore") {
            editorStoreBindings.add(element.name.text);
          }
        }
      }
    }
    if (
      !isTestFile &&
      sourcePath !== "domains/canvas/state/editorStore.ts" &&
      sourcePath !== "domains/canvas/state/canvasState.ts" &&
      sourcePath !== "domains/canvas/state/canvasCommands.ts" &&
      editorStoreBindings.size > 0
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (ts.isImportDeclaration(node)) {
        violations.push(
          `${sourcePath}:${location.line + 1}: production code must use canvas state/query/command ports instead of useEditorStore`
        );
      }
    }
    if (
      !isTestFile &&
      sourcePath !== "domains/canvas/state/editorStore.ts" &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "setState" &&
      ts.isIdentifier(node.expression.expression) &&
      editorStoreBindings.has(node.expression.expression.text)
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${sourcePath}:${location.line + 1}: production code must update editor state through store commands`
      );
    }
    let specifier = null;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifier = node.arguments[0].text;
    }

    if (specifier) {
      const targetPath = resolveImport(absolutePath, specifier);
      if (targetPath) {
        const sourceLocation = describeLocation(sourcePath);
        const targetLocation = describeLocation(targetPath);
        if (
          !isTestFile &&
          sourceLocation.layer === "domains" &&
          targetLocation.layer === "domains" &&
          sourceLocation.domain !== targetLocation.domain
        ) {
          const targets = domainEdges.get(sourceLocation.domain) ?? new Set();
          targets.add(targetLocation.domain);
          domainEdges.set(sourceLocation.domain, targets);
        }
        const reason = validateDependency(sourcePath, targetPath, isTestFile);
        if (reason) {
          const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push(`${sourcePath}:${location.line + 1} -> ${specifier}: ${reason}`);
        }
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

function findDomainCycles(edges) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(domain) {
    if (visiting.has(domain)) {
      const start = stack.indexOf(domain);
      cycles.push([...stack.slice(start), domain]);
      return;
    }
    if (visited.has(domain)) return;
    visiting.add(domain);
    stack.push(domain);
    for (const target of edges.get(domain) ?? []) visit(target);
    stack.pop();
    visiting.delete(domain);
    visited.add(domain);
  }

  for (const domain of edges.keys()) visit(domain);
  return cycles;
}

for (const cycle of findDomainCycles(domainEdges)) {
  violations.push(`domain cycle: ${cycle.join(" -> ")}`);
}
if (violations.length > 0) {
  console.error("Domain boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Domain boundaries are valid.");
