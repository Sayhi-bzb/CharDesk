import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript rule module intentionally runs in Node.
import { checkCellArchitecture } from "./cell-architecture-rules.mjs";

const messages = (content: string, file: string) => checkCellArchitecture(content, file)
  .map((violation: { message: string }) => violation.message);

describe("Cell architecture rules", () => {
  it("enforces Cell behavior, appearance and feedback timing ownership", () => {
    expect(messages('import { theme } from "./theme.js";', "packages/cell-ui/src/primitive-behavior.ts")[0]).toContain("must not depend");
    expect(messages('window.setTimeout(callback);', "packages/cell-ui/src/interaction-controller.ts")[0]).toContain("DOM globals");
    expect(messages('import { dispatch } from "./interaction.js";', "packages/cell-ui/src/primitive-appearance.ts")[0]).toContain("must not depend");
    expect(messages('import type { WidgetCommand } from "./interaction.js";', "packages/cell-ui/src/confirmation-sequence.ts")[0]).toContain("must not depend");
    expect(messages('onCommand(command);', "packages/cell-ui/src/paint.ts")[0]).toContain("must not own");
    expect(messages('import type { CellUiTheme } from "./theme.js";', "packages/cell-ui/src/primitive-appearance.ts")).toEqual([]);
  });
  it("keeps Cell Core free of runtime and source dependencies", () => {
    expect(messages(JSON.stringify({ dependencies: { react: "latest" } }),
      "packages/cell-core/package.json")[0]).toContain("dependency react");
    expect(messages('import type { Cell } from "@chardesk/rendering";',
      "packages/cell-core/src/index.ts")[0]).toContain("product dependency");
    expect(messages("export const surface: HTMLCanvasElement = value;",
      "packages/cell-core/src/index.ts")[0]).toContain("DOM, or Canvas");
  });

  it("keeps normalized keyboard facts independent from browser adapters", () => {
    expect(messages(JSON.stringify({ dependencies: { react: "latest" } }),
      "packages/keyboard/package.json")[0]).toContain("Keyboard Core");
    expect(messages('import type { Cell } from "@chardesk/cell-core";',
      "packages/keyboard/src/index.ts")[0]).toContain("product dependency");
    expect(messages("export const event: KeyboardEvent = value;",
      "packages/keyboard/src/index.ts")[0]).toContain("browser event globals");
    expect(messages("export const adapt = (event: KeyboardEvent) => event;",
      "packages/keyboard/src/browser.ts")).toEqual([]);
  });

  it("keeps headless and Canvas adapters independent", () => {
    expect(messages('import type { X } from "@chardesk/rendering/canvas";',
      "packages/cell-ui/src/frame.ts")[0]).toContain("rendering root");
    expect(messages('import { x } from "@chardesk/cell-ui";',
      "src/widgets/canvas-editor/rendering/canvasCellFrame.ts")[0]).toContain(
      "must not depend"
    );
  });

  it("keeps the rendering root independent from its Canvas presenter", () => {
    expect(messages('export * from "./canvas.js";',
      "packages/rendering/src/index.ts")[0]).toContain("must not depend");
  });

  it("routes metrics, built-in Profiles, and range geometry to one owner", () => {
    expect(messages('import { x } from "@/shared/metrics";',
      "src/widgets/example.ts")[0]).toContain("Cell primitives");
    expect(messages('import { x } from "../shared/metrics/gridGeometry";',
      "src/example.ts")[0]).toContain("Cell primitives");
    expect(messages("createCharDeskFontProfile({});",
      "apps/cell-ui/src/font-options.ts")[0]).toContain("font Profiles");
    expect(messages("export const range = {};",
      "packages/viewer/src/grid-interaction.ts")[0]).toContain("Cell range geometry");
    expect(messages(
      'import { resolveCellRangeBounds } from "@chardesk/cell-core";',
      "packages/viewer/src/grid-interaction.ts"
    )).toEqual([]);
  });

  it("keeps the input session independent from Cell content", () => {
    expect(messages(
      'import type { GridCellSource } from "@/shared/types";',
      "src/domains/selection/model/static-grid-input-session.ts"
    )[0]).toContain("must not infer");
    expect(messages(
      "export const getLineOriginX = () => 0;",
      "src/shared/example.ts"
    )[0]).toContain("Retired inferred input-flow");
  });

  it("keeps Cell deletion behind one directional contract", () => {
    expect(messages(
      "export const deleteTextForward = () => undefined;",
      "src/example.ts"
    )[0]).toContain("Retired split deletion contract");
  });

  it("keeps static-grid interaction in one discriminated state", () => {
    expect(messages(
      "export const cursor = interaction.textCursor;",
      "src/example.ts"
    )[0]).toContain("Retired split static-grid state contract");
    expect(messages(
      "export const setTextCursor = () => undefined;",
      "src/example.ts"
    )[0]).toContain("Retired split static-grid state contract");
  });

  it.each([
    "CharDeskCanvasMetrics",
    "DEFAULT_CHARDESK_CANVAS_METRICS",
    "CharDeskCanvasFrameCell",
    "CharDeskCanvasCursorShape",
    "CharDeskCanvasCursorStyle",
  ])("rejects retired production contract %s", (contract) => {
    expect(messages(`export const value: ${contract} = source;`,
      "packages/example/src/index.ts")[0]).toContain("Retired");
  });

  it("ignores tests while scanning retired production contracts", () => {
    expect(messages("CharDeskCanvasMetrics", "packages/example/src/index.test.ts"))
      .toEqual([]);
  });
});
