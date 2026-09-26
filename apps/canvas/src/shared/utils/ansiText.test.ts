import { describe, expect, it } from "vitest";
import { parsePlainTextCells } from "./ansiText";

describe("parsePlainTextCells", () => {
  it("maps multiline plain text to relative grid cells", () => {
    expect(parsePlainTextCells("AB\r\n\t你\n\nC", "#123456")).toEqual([
      { x: 0, y: 0, char: "A", color: "#123456" },
      { x: 1, y: 0, char: "B", color: "#123456" },
      { x: 0, y: 1, char: " ", color: "#123456" },
      { x: 1, y: 1, char: " ", color: "#123456" },
      { x: 2, y: 1, char: " ", color: "#123456" },
      { x: 3, y: 1, char: " ", color: "#123456" },
      { x: 4, y: 1, char: "你", color: "#123456" },
      { x: 0, y: 3, char: "C", color: "#123456" },
    ]);
  });

  it("keeps ANSI-like text literal in plain mode", () => {
    expect(parsePlainTextCells("[91mA", "#ffffff").map((cell) => cell.char).join(""))
      .toBe("[91mA");
  });
});
