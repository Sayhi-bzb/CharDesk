import { expect, it } from "vitest";
import { CellBuffer } from "./buffer.js";

it("over retains only the existing background; replace still replaces everything", () => {
  const buffer = new CellBuffer({ width: 3, height: 1 });
  buffer.writeText(0, 0, "old", "under", { backgroundColor: "red", color: "blue", bold: true });
  buffer.writeText(0, 0, "A ", "over", { underline: true }, undefined, 2, "over");
  expect(buffer.get(0, 0)).toMatchObject({ text: "A", ownerId: "over", style: { backgroundColor: "red", underline: true } });
  expect(buffer.get(0, 0)?.style).toEqual({ backgroundColor: "red", underline: true });
  expect(buffer.get(1, 0)?.text).toBe(" ");
  buffer.writeGrapheme(0, 0, "B", "over", { backgroundColor: "green" }, undefined, "over");
  expect(buffer.get(0, 0)?.style.backgroundColor).toBe("green");
  buffer.writeGrapheme(0, 0, "C", "replace");
  expect(buffer.get(0, 0)?.style).toEqual({});
  buffer.clear({ x: 0, y: 0, width: 3, height: 1 });
  expect(buffer.get(1, 0)).toMatchObject({ ownerId: null, style: {} });
});

it("wide glyphs preserve each physical background and never leave orphan glyphs", () => {
  for (const text of ["中", "👋"]) {
    for (const replaced of [0, 1]) {
      const buffer = new CellBuffer({ width: 2, height: 1 });
      buffer.writeGrapheme(0, 0, " ", "left", { backgroundColor: "red" });
      buffer.writeGrapheme(1, 0, " ", "right", { backgroundColor: "blue" });
      buffer.writeGrapheme(0, 0, text, "wide", { bold: true }, undefined, "over");
      expect(buffer.get(0, 0)?.style.backgroundColor).toBe("red");
      expect(buffer.get(1, 0)).toMatchObject({ continuation: true, style: { backgroundColor: "blue" } });
      const before = buffer.toText();
      buffer.writeGrapheme(0, 0, "界", "clipped", {}, { x: 0, y: 0, width: 1, height: 1 }, "over");
      expect(buffer.toText()).toBe(before);
      buffer.writeGrapheme(replaced, 0, "x", "new", {}, undefined, "over");
      expect(buffer.get(replaced, 0)?.ownerId).toBe("new");
      expect(buffer.get(1 - replaced, 0)).toMatchObject({ text: " ", continuation: false, ownerId: null });
      expect(buffer.get(0, 0)?.style).toEqual({ backgroundColor: "red" });
      expect(buffer.get(1, 0)?.style).toEqual({ backgroundColor: "blue" });
    }
  }
});
