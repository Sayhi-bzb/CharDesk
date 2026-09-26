import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  shouldPreventHorizontalNavigation,
  useHorizontalWheelNavigationGuard,
} from "./useHorizontalWheelNavigationGuard";

describe("horizontal wheel navigation guard", () => {
  it("identifies cancelable horizontal-dominant wheels", () => {
    expect(
      shouldPreventHorizontalNavigation({
        cancelable: true,
        deltaX: 10,
        deltaY: 2,
      })
    ).toBe(true);
  });

  it.each([
    { cancelable: true, deltaX: 2, deltaY: 10 },
    { cancelable: true, deltaX: 10, deltaY: -10 },
    { cancelable: true, deltaX: 0, deltaY: 0 },
    { cancelable: false, deltaX: 10, deltaY: 2 },
  ])("preserves non-horizontal or non-cancelable wheels: %o", (wheel) => {
    expect(shouldPreventHorizontalNavigation(wheel)).toBe(false);
  });

  it("prevents horizontal wheel defaults at the application boundary", () => {
    renderHook(() => useHorizontalWheelNavigationGuard());
    const event = new WheelEvent("wheel", {
      cancelable: true,
      deltaX: 10,
      deltaY: 2,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps vertical wheel defaults available", () => {
    renderHook(() => useHorizontalWheelNavigationGuard());
    const event = new WheelEvent("wheel", {
      cancelable: true,
      deltaX: 2,
      deltaY: 10,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
