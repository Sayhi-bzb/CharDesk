import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShortcutProvider } from "@/shared/shortcuts/dispatcher";
import { useCanvasSpacePan } from "./useCanvasSpacePan";

const renderSpacePan = (enabled = true) =>
  renderHook(({ active }) => useCanvasSpacePan({ enabled: active }), {
    initialProps: { active: enabled },
    wrapper: ShortcutProvider,
  });

const createManagedTextarea = () => {
  const textarea = document.createElement("textarea");
  textarea.dataset.canvasManagedInput = "true";
  document.body.append(textarea);
  return textarea;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("useCanvasSpacePan", () => {
  it("holds one temporary pan state across Space repeats", () => {
    const textarea = createManagedTextarea();
    const { result } = renderSpacePan();

    const keydown = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => textarea.dispatchEvent(keydown));
    expect(keydown.defaultPrevented).toBe(true);
    expect(result.current).toBe(true);

    fireEvent.keyDown(textarea, { key: " ", code: "Space", repeat: true });
    expect(result.current).toBe(true);

    fireEvent.keyUp(textarea, { key: " ", code: "Space" });
    expect(result.current).toBe(false);
  });

  it("does not own Space outside the managed canvas or while disabled", () => {
    const textarea = createManagedTextarea();
    const button = document.createElement("button");
    document.body.append(button);
    const { result, rerender } = renderSpacePan();

    fireEvent.keyDown(button, { key: " ", code: "Space" });
    expect(result.current).toBe(false);

    rerender({ active: false });
    const keydown = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    act(() => textarea.dispatchEvent(keydown));
    expect(keydown.defaultPrevented).toBe(false);
    expect(result.current).toBe(false);
  });

  it("clears an active pan when Canvas focus or edit eligibility is lost", () => {
    const textarea = createManagedTextarea();
    const { result, rerender } = renderSpacePan();

    fireEvent.keyDown(textarea, { key: " ", code: "Space" });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });
});
