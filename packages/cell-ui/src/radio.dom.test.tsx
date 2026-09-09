import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useCellRadioState } from "./browser-radio.js";

const items = [
  { id: "light", value: "light", label: "Light" },
  { id: "dark", value: "dark", label: "Dark" },
  { id: "disabled", value: "disabled", label: "Disabled", disabled: true },
];

it("radio adapter separates focus from selection and suppresses duplicate changes", () => {
  const change = vi.fn();
  const { result } = renderHook(() => useCellRadioState(items, { defaultValue: "light", onValueChange: change }));
  act(() => result.current.dispatch({ type: "focus", targetId: "dark" }));
  expect(result.current.value).toBe("light");
  act(() => result.current.dispatch({ type: "select-radio", targetId: "dark" }));
  expect(result.current.value).toBe("dark");
  act(() => result.current.dispatch({ type: "activate", targetId: "dark" }));
  act(() => result.current.dispatch({ type: "activate", targetId: "disabled" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("dark");
});

it("radio adapter supports controlled values, disabled groups and item removal", () => {
  const change = vi.fn();
  const { result, rerender } = renderHook(({ disabled, value, list }) => useCellRadioState(list, {
    value, disabled, onValueChange: change,
  }), { initialProps: { disabled: false, value: "light", list: items } });
  act(() => result.current.dispatch({ type: "activate", targetId: "dark" }));
  expect(change).toHaveBeenCalledWith("dark");
  expect(result.current.value).toBe("light");
  rerender({ disabled: true, value: "dark", list: items });
  expect(result.current.focusedId).toBeNull();
  act(() => result.current.dispatch({ type: "activate", targetId: "light" }));
  expect(change).toHaveBeenCalledTimes(1);
  rerender({ disabled: false, value: "dark", list: [items[0]!] });
  expect(result.current.focusedId).toBe("light");
});
