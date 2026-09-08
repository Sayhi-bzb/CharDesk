import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript rule module intentionally runs in Node.
import { checkCellArchitecture } from "./cell-architecture-rules.mjs";

const messages = (content: string, file: string) => checkCellArchitecture(content, file)
  .map((violation: { message: string }) => violation.message);

describe("Cell architecture rules", () => {
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
