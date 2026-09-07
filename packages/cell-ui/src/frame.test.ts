import { describe, expect, it } from "vitest";
import { CellBuffer } from "./buffer.js";
import { createCellBufferSource } from "./frame.js";

describe("Cell UI Frame adapter", () => {
  it("exposes a bounded zero-copy Cell source", () => {
    const buffer = new CellBuffer({ width: 3, height: 2 });
    buffer.writeGrapheme(1, 0, "界", "owner", { color: "red" });
    const source = createCellBufferSource(buffer);
    const visited: string[] = [];
    source.visit({ x: 1, y: 0, width: 2, height: 1 }, (x, y, cell) => {
      visited.push(`${x},${y}:${cell.text}:${cell.continuation}`);
    });
    expect(visited).toEqual(["1,0:界:false", "2,0::true"]);
    expect(source.getContentBounds()).toEqual({ x: 0, y: 0, width: 3, height: 2 });
    expect(source.get({ x: 1, y: 0 })).toBe(buffer.get(1, 0));
  });
});
