import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_AUTO_COLLAPSE_BREAKPOINT,
  useShouldAutoCollapseSidebar,
  useSidebarAutoCollapseSignal,
} from "@/shared/hooks/use-mobile";

describe("sidebar auto-collapse media hooks", () => {
  const originalMatchMedia = window.matchMedia;
  const originalInnerWidth = window.innerWidth;
  const listeners = new Set<() => void>();

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    listeners.clear();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
  }

  function mockMatchMedia() {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: window.innerWidth < SIDEBAR_AUTO_COLLAPSE_BREAKPOINT,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_eventName: string, listener: () => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_eventName: string, listener: () => void) => {
        listeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  function resizeTo(width: number) {
    setViewportWidth(width);
    act(() => {
      listeners.forEach((listener) => listener());
    });
  }

  it("treats 1199px as narrow", () => {
    setViewportWidth(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1);
    mockMatchMedia();

    const { result } = renderHook(() => useShouldAutoCollapseSidebar());

    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1199px)");
  });

  it("treats 1200px as wide", () => {
    setViewportWidth(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT);
    mockMatchMedia();

    const { result } = renderHook(() => useShouldAutoCollapseSidebar());

    expect(result.current).toBe(false);
  });

  it("triggers when initially mounted narrow", () => {
    setViewportWidth(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1);
    mockMatchMedia();

    const { result } = renderHook(() => useSidebarAutoCollapseSignal());

    expect(result.current).toBe(1);
  });

  it("triggers once when resizing from wide to narrow", () => {
    setViewportWidth(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT);
    mockMatchMedia();

    const { result } = renderHook(() => useSidebarAutoCollapseSignal());

    expect(result.current).toBe(0);

    resizeTo(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1);

    expect(result.current).toBe(1);
  });

  it("does not retrigger while staying narrow", () => {
    setViewportWidth(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT);
    mockMatchMedia();

    const { result } = renderHook(() => useSidebarAutoCollapseSignal());

    resizeTo(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 1);
    expect(result.current).toBe(1);

    resizeTo(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT - 100);
    expect(result.current).toBe(1);
  });
});
