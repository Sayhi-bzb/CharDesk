import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCellSelectState } from "./browser.js";

const items = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "disabled", label: "Disabled", disabled: true },
  { id: "system", label: "System" },
] as const;

describe("useCellSelectState", () => {
  it("keeps navigation provisional and commits only activation", () => {
    const selection = vi.fn();
    const opened = vi.fn();
    const { result } = renderHook(() => useCellSelectState("theme", items, {
      defaultSelectedId: "dark",
      onSelectionChange: selection,
      onOpenChange: opened,
    }));

    expect(result.current).toMatchObject({
      triggerId: "theme-trigger",
      contentId: "theme-content",
      open: false,
      focusedId: "theme-trigger",
      selectedId: "dark",
    });
    act(() => result.current.dispatch({
      type: "set-expanded",
      targetId: "theme-trigger",
      expanded: true,
    }));
    expect(result.current).toMatchObject({ open: true, focusedId: "dark", selectedId: "dark" });
    act(() => result.current.dispatch({
      type: "focus",
      targetId: "dark",
      reveal: { targetId: "theme-content", scrollX: 0, scrollY: 2 },
    }));
    expect(result.current.scrollY).toBe(2);
    act(() => result.current.dispatch({
      type: "scroll",
      targetId: "theme-content",
      scrollX: 0,
      scrollY: 3,
    }));
    expect(result.current.scrollY).toBe(3);
    act(() => result.current.dispatch({ type: "focus", targetId: "system" }));
    expect(result.current).toMatchObject({ focusedId: "system", selectedId: "dark" });
    act(() => result.current.dispatch({ type: "activate", targetId: "disabled" }));
    expect(result.current).toMatchObject({ open: true, focusedId: "system", selectedId: "dark" });
    act(() => result.current.dispatch({ type: "dismiss", targetId: "theme-content" }));
    expect(result.current).toMatchObject({
      open: false,
      focusedId: "theme-trigger",
      selectedId: "dark",
      scrollY: 0,
    });

    act(() => result.current.dispatch({
      type: "set-expanded",
      targetId: "theme-trigger",
      expanded: true,
    }));
    act(() => result.current.dispatch({ type: "activate", targetId: "system" }));
    expect(result.current).toMatchObject({
      open: true,
      focusedId: "dark",
      selectedId: "system",
      selectedItem: items[3],
    });
    expect(selection).toHaveBeenCalledWith("system");
    act(() => result.current.dispatch({ type: "dismiss", targetId: "theme-content" }));
    expect(result.current).toMatchObject({
      open: false,
      focusedId: "theme-trigger",
      selectedId: "system",
    });
    expect(opened.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
  });

  it("reports controlled changes without mutating controlled value or open state", () => {
    const selection = vi.fn();
    const opened = vi.fn();
    const { result, rerender } = renderHook(
      ({ selectedId, open }) => useCellSelectState("theme", items, {
        selectedId,
        open,
        onSelectionChange: selection,
        onOpenChange: opened,
      }),
      { initialProps: { selectedId: "dark" as string | null, open: false } }
    );

    act(() => result.current.dispatch({
      type: "set-expanded",
      targetId: "theme-trigger",
      expanded: true,
    }));
    expect(result.current.open).toBe(false);
    expect(result.current.focusedId).toBe("theme-trigger");
    expect(opened).toHaveBeenLastCalledWith(true);
    rerender({ selectedId: "dark", open: true });
    expect(result.current).toMatchObject({ open: true, focusedId: "dark" });

    act(() => result.current.dispatch({ type: "activate", targetId: "light" }));
    expect(selection).toHaveBeenLastCalledWith("light");
    expect(opened).toHaveBeenLastCalledWith(true);
    expect(result.current).toMatchObject({ open: true, focusedId: "dark", selectedId: "dark" });
    act(() => result.current.dispatch({ type: "dismiss", targetId: "theme-content" }));
    expect(opened).toHaveBeenLastCalledWith(false);
    rerender({ selectedId: "light", open: false });
    expect(result.current).toMatchObject({
      open: false,
      focusedId: "theme-trigger",
      selectedId: "light",
    });
  });
});
