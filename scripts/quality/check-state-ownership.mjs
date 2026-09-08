import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = path.resolve("src");
const RAW_CANVAS_BINDINGS = new Set([
  "yStructuredScene",
  "yStructuredComponents",
]);
const IMPLICIT_DOCUMENT_MUTATIONS = new Set([
  "mutateGrid",
  "replaceStructuredContent",
  "runTransaction",
]);
const FORBIDDEN_PUBLIC_CANVAS_EXPORTS = new Set([
  "applyFreeformSnapshotToYMaps",
  "forceHistorySave",
  "getActiveCanvasDocument",
  "getCanvasDocument",
  "undoManager",
  "useEditorStore",
  "EditorState",
  "createSurfaceGridProjection",
  "getSurfaceGridReader",
  "isSurfaceGridProjection",
]);
const CONTENT_STATE_FIELDS = new Set([
  "grid",
  "contentSurface",
  "structuredScene",
  "structuredComponents",
]);
const DESCRIPTOR_CONTENT_FIELDS = new Set([
  "grid",
  "scene",
  "components",
  "slideDeck",
]);
const LEGACY_SESSION_CONTENT_HELPERS = new Set([
  "resolveSessionRuntime",
  "stripSessionContent",
  "stripSlideDeckContent",
]);
const CONTENT_STATE_WRITE_OWNERS = new Set([
  "domains/canvas/state/browserPersistence.ts",
  "domains/canvas/state/canvasDocumentProjection.ts",
  "domains/canvas/state/editorStore.ts",
]);
const EDITOR_STORE_IMPORT_OWNERS = new Set([
  "domains/canvas/state/browserPersistence.ts",
  "domains/canvas/state/canvasCommands.ts",
  "domains/canvas/state/canvasState.ts",
  "domains/canvas/testing.ts",
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
  if (sourcePath.startsWith("test/") || /\.(?:test|spec)\.[tj]sx?$/.test(sourcePath)) continue;
  const sourceText = fs.readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  function report(node, message) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${sourcePath}:${location.line + 1}: ${message}`);
  }
  function isInsideStateWrite(node) {
    let current = node.parent;
    while (current) {
      if (ts.isCallExpression(current)) {
        const callee = current.expression;
        if (
          (ts.isIdentifier(callee) && callee.text === "set") ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === "setState")
        ) {
          return true;
        }
      }
      current = current.parent;
    }
    return false;
  }
  function inspect(node) {
    if (
      ts.isIdentifier(node) &&
      LEGACY_SESSION_CONTENT_HELPERS.has(node.text)
    ) {
      report(node, `legacy session-content helper ${node.text}`);
    }
    if (
      ts.isPropertySignature(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      DESCRIPTOR_CONTENT_FIELDS.has(node.name.text)
    ) {
      let declaration = node.parent;
      while (
        declaration &&
        !ts.isInterfaceDeclaration(declaration) &&
        !ts.isTypeAliasDeclaration(declaration)
      ) {
        declaration = declaration.parent;
      }
      const declarationName = declaration?.name?.text ?? "";
      if (
        declarationName.includes("CanvasSessionDescriptor") ||
        declarationName === "SlideDescriptor" ||
        declarationName === "SlideDeckDescriptor"
      ) {
        report(node, `${declarationName} must not own ${node.name.text}`);
      }
    }
    if (
      ts.isStringLiteral(node) &&
      node.text === "main-grid" &&
      sourcePath !== "domains/canvas/state/browserPersistence.ts"
    ) {
      report(node, "legacy main-grid channel outside the one-shot local migration");
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      if (
        (moduleName.endsWith("/domains/canvas/state/editorStore") ||
          moduleName === "./editorStore") &&
        !EDITOR_STORE_IMPORT_OWNERS.has(sourcePath)
      ) {
        report(node, "private editor store import outside the Canvas facade");
      }
      if (moduleName.endsWith("/domains/canvas/testing")) {
        report(node, "Canvas testing API imported by production code");
      }
    }
    if (
      sourcePath !== "domains/canvas/state/canvasDocument.ts" &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["set", "delete", "clear"].includes(node.expression.name.text) &&
      ts.isIdentifier(node.expression.expression) &&
      RAW_CANVAS_BINDINGS.has(node.expression.expression.text)
    ) {
      report(node, `raw canvas map mutation via ${node.expression.expression.text}`);
    }
    if (
      sourcePath !== "domains/canvas/state/CanvasDocumentRegistry.ts" &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      IMPLICIT_DOCUMENT_MUTATIONS.has(node.expression.name.text)
    ) {
      report(
        node,
        `implicit active-page mutation via ${node.expression.name.text}; pass a CanvasDocumentAddress`
      );
    }
    if (
      sourcePath === "domains/canvas/public.ts" &&
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        if (FORBIDDEN_PUBLIC_CANVAS_EXPORTS.has(element.name.text)) {
          report(element, `low-level canvas export ${element.name.text}`);
        }
      }
    }
    if (
      sourcePath === "domains/canvas/state/interfaces.ts" &&
      ts.isPropertySignature(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "grid"
    ) {
      report(node, "Canvas state must expose contentSurface, never a live GridMap");
    }
    if (
      sourcePath === "domains/canvas/state/interfaces.ts" &&
      ts.isPropertySignature(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "canvasSessions" &&
      !node.type.getText(sourceFile).includes("CanvasSessionDescriptor")
    ) {
      report(node, "runtime canvasSessions must contain descriptors only");
    }
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && CONTENT_STATE_FIELDS.has(node.name.text)) ||
        (ts.isStringLiteral(node.name) && CONTENT_STATE_FIELDS.has(node.name.text))) &&
      isInsideStateWrite(node) &&
      !CONTENT_STATE_WRITE_OWNERS.has(sourcePath)
    ) {
      report(node, `canvas content state write outside the document projector`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

if (violations.length > 0) {
  console.error("State ownership violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Canvas state ownership is valid.");
