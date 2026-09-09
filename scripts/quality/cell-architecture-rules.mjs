const productionSource = (file) => /\.(?:ts|tsx)$/.test(file)
  && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file);

const imports = (content) => Array.from(
  content.matchAll(/\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g),
  (match) => match[1]
);

const retiredContracts = [
  "CharDeskCanvasMetrics",
  "DEFAULT_CHARDESK_CANVAS_METRICS",
  "CharDeskCanvasFrameCell",
  "CharDeskCanvasCursorShape",
  "CharDeskCanvasCursorStyle",
];
const forbiddenCoreDependency = (dependency) => dependency === "react"
  || dependency === "react-dom"
  || dependency === "canvas"
  || dependency.startsWith("@chardesk/");
const forbiddenCoreGlobal = /\b(?:React|document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas)\b/;
const forbiddenKeyboardCoreGlobal = /\b(?:React|document|window|EventTarget|KeyboardEvent|HTMLElement|HTMLCanvasElement)\b/;

export function checkCellArchitecture(content, file) {
  const violations = [];
  const report = (message) => violations.push({ file, message });

  if (file === "packages/cell-core/package.json" || file === "packages/keyboard/package.json") {
    const manifest = JSON.parse(content);
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        if (forbiddenCoreDependency(dependency)) {
          const owner = file.includes("keyboard") ? "Keyboard Core" : "Cell Core";
          report(`${owner} must not have host or product dependency ${dependency}`);
        }
      }
    }
    return violations;
  }

  if (!productionSource(file)) return violations;
  const moduleImports = imports(content);
  const cellUiModule = file.startsWith("packages/cell-ui/src/") ? file.slice("packages/cell-ui/src/".length) : null;
  const behaviorModules = ["primitive-behavior.ts", "interaction-controller.ts", "interaction.ts", "press.ts", "gestures.ts", "visual-state.ts"];
  if (behaviorModules.includes(cellUiModule)) {
    if (moduleImports.some((dependency) => /(?:browser|theme|visual\.js|primitive-appearance|paint|rendering\/canvas)/.test(dependency))) {
      report("Cell behavior must not depend on host, theme, appearance, or Canvas rendering");
    }
    if (/\b(?:document|window|HTMLElement|HTMLCanvasElement)\b/.test(content)) report("Cell behavior must not use DOM globals");
  }
  if (cellUiModule === "primitive-appearance.ts" || cellUiModule === "confirmation-sequence.ts") {
    const allowed = cellUiModule === "primitive-appearance.ts"
      ? ["./types.js", "./theme.js"] : ["./activation-feedback-config.js"];
    if (moduleImports.some((dependency) => !allowed.includes(dependency))) report("Cell appearance and feedback timing must not depend on behavior or hosts");
    if (/\b(?:WidgetCommand|dispatch|onCommand)\b/.test(content)) report("Cell appearance and feedback timing must not dispatch commands");
  }
  if (cellUiModule === "paint.ts" && /\b(?:WidgetCommand|onCommand|commandForInput|CellInteractionController)\b/.test(content)) {
    report("Cell painting must not own interaction transitions");
  }
  if (file.startsWith("packages/cell-core/src/")) {
    for (const dependency of moduleImports) {
      if (forbiddenCoreDependency(dependency)) {
        report(`Cell Core source must not import host or product dependency ${dependency}`);
      }
    }
    if (forbiddenCoreGlobal.test(content)) {
      report("Cell Core source must not use React, DOM, or Canvas globals");
    }
  }
  if (file === "packages/keyboard/src/index.ts") {
    for (const dependency of moduleImports) {
      if (forbiddenCoreDependency(dependency)) {
        report(`Keyboard Core source must not import host or product dependency ${dependency}`);
      }
    }
    if (forbiddenKeyboardCoreGlobal.test(content)) {
      report("Keyboard Core source must not use React, DOM, or browser event globals");
    }
  }
  if (
    file === "packages/cell-ui/src/frame.ts"
    && moduleImports.includes("@chardesk/rendering/canvas")
  ) {
    report("The headless Cell UI frame adapter must consume the rendering root contract");
  }
  if (
    file === "src/widgets/canvas-editor/rendering/canvasCellFrame.ts"
    && moduleImports.some((dependency) => dependency === "@chardesk/cell-ui"
      || dependency.startsWith("@chardesk/cell-ui/"))
  ) {
    report("The Canvas frame adapter must not depend on the Cell UI state machine");
  }
  if (
    file === "packages/rendering/src/index.ts"
    && moduleImports.some((dependency) => dependency === "./canvas"
      || dependency === "./canvas.js")
  ) {
    report("The rendering root must not depend on the Canvas presenter");
  }
  for (const contract of retiredContracts) {
    if (content.includes(contract)) report(`Retired Canvas-owned Cell contract: ${contract}`);
  }
  return violations;
}
