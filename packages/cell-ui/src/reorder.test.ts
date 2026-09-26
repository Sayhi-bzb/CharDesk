import { expect, it } from "vitest";
import { reorderCellItems } from "./reorder.js";

it("moves an item by stable id without mutating app data", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(reorderCellItems(items, "a", 2).map((item) => item.id)).toEqual(["b", "c", "a"]);
  expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  expect(reorderCellItems(items, "missing", 2)).toBe(items);
});
