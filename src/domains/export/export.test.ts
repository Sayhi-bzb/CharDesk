import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  exportSelectionToString,
  exportToAnsi,
  exportToCharDesk,
} from "@/domains/export/public";

describe("export formats", () => {
  it("exports visible CharDesk controls without ESC", () => {
    const grid = new GridSnapshotSource([["0,0", { char: "A", color: "#ff0000" }]]);
    expect(exportToCharDesk(grid)).toBe("[91mA[m");
    expect(exportToAnsi(grid)).toBe("\u001b[91mA\u001b[m");
  });

  it("exports static text selections and ANSI text", () => {
    const grid = new GridSnapshotSource([["0,0", { char: "A", color: "#ffffff" }]]);
    expect(exportSelectionToString(grid, [{ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }])).toBe("A");
    expect(exportToAnsi(grid)).toContain("A");
  });
});
