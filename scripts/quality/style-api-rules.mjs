import ts from "typescript";

const forbiddenHostDependencies = [
  { pattern: /^sonner$/, owner: "Sonner" },
  { pattern: /^next-themes$/, owner: "next-themes" },
  { pattern: /^radix-ui$/, owner: "Radix UI" },
  { pattern: /^@radix-ui\//, owner: "Radix UI" },
  { pattern: /^@base-ui\//, owner: "Base UI" },
];

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
const attribute = (node, name) =>
  node.attributes.properties.find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.getText() === name
  );
const literalAttribute = (node, name) => {
  const candidate = attribute(node, name);
  return candidate?.initializer && ts.isStringLiteral(candidate.initializer)
    ? candidate.initializer.text
    : undefined;
};
const isHiddenFileInput = (node, relFile) =>
  relFile === "apps/canvas/src/widgets/session-tabs/CanvasBreadcrumb.tsx" &&
  literalAttribute(node, "type") === "file" &&
  literalAttribute(node, "className")?.split(/\s+/).includes("sr-only") &&
  literalAttribute(node, "aria-hidden") === "true";
const isManagedCanvasTextarea = (node, relFile) =>
  relFile === "apps/canvas/src/widgets/canvas-editor/CanvasSurface.tsx" &&
  literalAttribute(node, "data-canvas-managed-input") === "true";
const isModuleLoadFailureButton = (node, relFile) =>
  relFile === "apps/canvas/src/app/StartupScreens.tsx" &&
  literalAttribute(node, "className") === "startup-action";

export function checkLegacyButtonProps(content, relFile) {
  if (!content.includes("<Button")) return [];
  const sourceFile = ts.createSourceFile(
    relFile,
    content,
    ts.ScriptTarget.Latest,
    true,
    relFile.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const cellUiButton = sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "@chardesk/cell-ui" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) =>
          element.name.text === "Button" && (element.propertyName?.text ?? element.name.text) === "Button"
      )
  );
  if (cellUiButton) return [];
  const violations = [];
  const visit = (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "Button"
    ) {
      const line = lineOf(sourceFile, node);
      if (attribute(node, "variant")) {
        violations.push({ check: "No legacy <Button variant=...> usage", file: relFile, line });
      }
      if (["icon", "icon-sm", "icon-lg"].includes(literalAttribute(node, "size"))) {
        violations.push({ check: "No legacy icon Button sizes", file: relFile, line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function checkHostArchitecture(content, relFile) {
  if (!/^apps\/canvas\/src\/(?:app|widgets|shared|domains)\//.test(relFile)) return [];
  if (/\.(?:test|spec)\.[^.]+$/.test(relFile)) return [];

  const sourceFile = ts.createSourceFile(
    relFile,
    content,
    ts.ScriptTarget.Latest,
    true,
    relFile.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const violations = [];
  const report = (check, node) =>
    violations.push({ check, file: relFile, line: lineOf(sourceFile, node) });
  const checkDependency = (specifier, node) => {
    const forbidden = forbiddenHostDependencies.find(({ pattern }) => pattern.test(specifier));
    if (forbidden) report(`Host must consume ${forbidden.owner} through @chardesk/ui`, node);
    if (
      (specifier === "driver.js" || specifier.startsWith("driver.js/")) &&
      relFile !== "apps/canvas/src/widgets/onboarding/driver-adapter.ts"
    ) {
      report("Driver.js is confined to the onboarding adapter", node);
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      checkDependency(node.moduleSpecifier.text, node);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      checkDependency(node.arguments[0].text, node);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "getPropertyValue" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith("--")
    ) {
      report("Host must read visual CSS values through readUiRuntimeTheme", node);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === "button" && !isModuleLoadFailureButton(node, relFile)) {
        report("Host must use shared interactive primitives instead of raw buttons", node);
      }
      if (tagName === "input" && !isHiddenFileInput(node, relFile)) {
        report("Visible Host inputs must use shared form primitives", node);
      }
      if (tagName === "textarea" && !isManagedCanvasTextarea(node, relFile)) {
        report("Host textareas must use shared form primitives", node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}
