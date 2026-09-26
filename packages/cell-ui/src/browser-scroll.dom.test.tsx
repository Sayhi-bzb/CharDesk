import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useCellScrollState } from "./browser-scroll.js";

it("keeps both scroll axes and every focus reveal by target id", () => {
  const { result } = renderHook(useCellScrollState);
  expect(result.current.offset("outer")).toEqual({ x: 0, y: 0 });
  act(() => result.current.dispatch({ type: "scroll", targetId: "inner", scrollX: 3, scrollY: 2 }));
  expect(result.current.offset("inner")).toEqual({ x: 3, y: 2 });
  act(() => result.current.dispatch({ type: "focus", targetId: "target", reveals: [
    { targetId: "inner", scrollX: 3, scrollY: 4 },
    { targetId: "outer", scrollX: 1, scrollY: 6 },
  ] }));
  expect(result.current.offset("inner")).toEqual({ x: 3, y: 4 });
  expect(result.current.offset("outer")).toEqual({ x: 1, y: 6 });
  act(() => result.current.dispatch({ type: "focus", targetId: "target",
    reveal: { targetId: "outer", scrollX: 0, scrollY: 1 } }));
  expect(result.current.offset("outer")).toEqual({ x: 0, y: 1 });
});
