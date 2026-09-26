import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript rule module intentionally runs in Node.
import { checkHostArchitecture } from "./style-api-rules.mjs";

const checks = (source: string, file = "apps/canvas/src/widgets/example.tsx") =>
  checkHostArchitecture(source, file).map((violation: { check: string }) => violation.check);

describe("Host style architecture rules", () => {
  it.each(["sonner", "next-themes", "radix-ui", "@radix-ui/react-dialog", "@base-ui/react"])(
    "keeps %s behind the UI facade",
    (dependency) => {
      expect(checks(`import { x } from "${dependency}";`)[0]).toContain("@chardesk/ui");
    }
  );

  it("confines Driver.js to its adapter", () => {
    expect(checks('const driver = import("driver.js");')[0]).toContain("onboarding adapter");
    expect(checks(
      'const driver = import("driver.js");',
      "apps/canvas/src/widgets/onboarding/driver-adapter.ts"
    )).toEqual([]);
  });

  it("rejects direct visual token reads", () => {
    expect(checks('getComputedStyle(node).getPropertyValue("--foreground")')[0]).toContain(
      "readUiRuntimeTheme"
    );
  });

  it("allows only the explicit native input escapes", () => {
    expect(checks('export const X = () => <input type="checkbox" />')).toHaveLength(1);
    expect(checks(
      'export const X = () => <input type="file" className="sr-only" aria-hidden="true" />',
      "apps/canvas/src/widgets/session-tabs/CanvasBreadcrumb.tsx"
    )).toEqual([]);
    expect(checks(
      'export const X = () => <textarea data-canvas-managed-input="true" />',
      "apps/canvas/src/widgets/canvas-editor/CanvasSurface.tsx"
    )).toEqual([]);
  });
});
