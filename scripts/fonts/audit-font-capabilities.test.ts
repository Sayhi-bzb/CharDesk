import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("font capability audit", () => {
  it("compares coverage, Cell advances, and Nerd outlines", () => {
    const output = execFileSync(process.execPath, [
      path.resolve("scripts/fonts/audit-font-capabilities.mjs"),
      "--baseline",
      "packages/font-maple/assets/maple-mono-nf-cn",
      "packages/font-maple/assets/maple-mono-nf-cn-bold",
      "packages/fonts/assets/symbols-nerd-font-mono",
    ], { encoding: "utf8" });
    const report = JSON.parse(output) as {
      schemaVersion: number;
      nerdCatalogCodePoints: number;
      targets: Array<{
        codePoints: number;
        coverage: Record<string, { covered: number; total: number }>;
        nerd: { covered: number; total: number };
        sampleAdvances: Record<string, { em: number }>;
        baseline: {
          missingCodePoints: number;
          nerdOutlines: { comparable: number; equal: number };
        };
      }>;
    };
    const target = report.targets[0]!;
    const nerdTarget = report.targets[1]!;

    expect(report.schemaVersion).toBe(1);
    expect(report.nerdCatalogCodePoints).toBe(10_385);
    expect(target.nerd).toEqual({ covered: 10_385, total: 10_385 });
    expect(target.coverage.cjkUnified).toEqual({ covered: 20_976, total: 20_992 });
    expect(target.sampleAdvances["U+41"]?.em).toBe(0.6);
    expect(target.sampleAdvances["U+4E2D"]?.em).toBe(1.2);
    expect(target.baseline.missingCodePoints).toBe(0);
    expect(target.baseline.nerdOutlines).toEqual({
      comparable: 10_385,
      equal: 10_382,
    });
    expect(nerdTarget.nerd).toEqual({ covered: 10_385, total: 10_385 });
    expect(nerdTarget.bytes).toBeLessThan(1_300_000);
  }, 15_000);
});
