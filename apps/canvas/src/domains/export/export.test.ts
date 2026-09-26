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

  it("uses the canonical artifact foreground semantics for ANSI", () => {
    expect(
      exportToAnsi(
        new GridSnapshotSource([["0,0", { char: "A", color: "#000000" }]])
      )
    ).toBe("A");
    expect(
      exportToAnsi(
        new GridSnapshotSource([[
          "0,0",
          { char: "B", color: "#000000", bgColor: "#0000ff" },
        ]])
      )
    ).toBe("\u001b[30;104mB\u001b[m");
    expect(
      exportToAnsi(
        new GridSnapshotSource([[
          "0,0",
          { char: "C", color: "#000000", bgColor: "transparent" },
        ]])
      )
    ).toBe("\u001b[30mC\u001b[m");
    expect(
      exportToAnsi(
        new GridSnapshotSource([["0,0", { char: "D", color: "#0f172a" }]])
      )
    ).toBe("\u001b[38;2;15;23;42mD\u001b[m");
  });
});
