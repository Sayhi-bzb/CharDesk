import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInPlaceFeedback } from "./use-in-place-feedback";

describe("useInPlaceFeedback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows success and error results for their configured durations", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInPlaceFeedback<string>());

    await act(async () => {
      await result.current.run("copy", () => true);
    });
    expect(result.current.feedback).toEqual({ target: "copy", status: "success" });

    act(() => vi.advanceTimersByTime(599));
    expect(result.current.feedback?.status).toBe("success");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.feedback).toBeNull();

    await act(async () => {
      await result.current.run("copy", () => false);
    });
    expect(result.current.feedback).toEqual({ target: "copy", status: "error" });
    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.feedback).toBeNull();
  });

  it("converts thrown operations to inline errors", async () => {
    const { result } = renderHook(() => useInPlaceFeedback<string>());

    await act(async () => {
      await result.current.run("copy", () => {
        throw new Error("clipboard denied");
      });
    });

    expect(result.current.feedback).toEqual({ target: "copy", status: "error" });
  });

  it("shows direct warning feedback for its configured duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useInPlaceFeedback<string>({ warningDurationMs: 3000 })
    );

    act(() => {
      result.current.show("fullscreen", "warning");
    });
    expect(result.current.feedback).toEqual({
      target: "fullscreen",
      status: "warning",
    });

    act(() => vi.advanceTimersByTime(2999));
    expect(result.current.feedback?.status).toBe("warning");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.feedback).toBeNull();
  });

  it("uses an operation result target without losing latest-operation protection", async () => {
    const { result } = renderHook(() =>
      useInPlaceFeedback<{ id: string; detail?: string }>()
    );

    await act(async () => {
      await result.current.run({ id: "png" }, async () => ({
        success: false,
        target: { id: "png", detail: "too-large" },
      }));
    });

    expect(result.current.feedback).toEqual({
      target: { id: "png", detail: "too-large" },
      status: "error",
    });
  });

  it("keeps only the result of the latest operation", async () => {
    let resolveFirst: ((value: boolean) => void) | undefined;
    let resolveSecond: ((value: boolean) => void) | undefined;
    const first = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<boolean>((resolve) => {
      resolveSecond = resolve;
    });
    const { result } = renderHook(() => useInPlaceFeedback<string>());

    let firstRun: Promise<unknown> | undefined;
    let secondRun: Promise<unknown> | undefined;
    act(() => {
      firstRun = result.current.run("first", () => first);
      secondRun = result.current.run("second", () => second);
    });

    await act(async () => {
      resolveSecond?.(true);
      await secondRun;
    });
    expect(result.current.feedback).toEqual({ target: "second", status: "success" });

    await act(async () => {
      resolveFirst?.(false);
      await firstRun;
    });
    expect(result.current.feedback).toEqual({ target: "second", status: "success" });
  });

  it("discards an async result after unmount", async () => {
    let resolveOperation: ((value: boolean) => void) | undefined;
    const operation = new Promise<boolean>((resolve) => {
      resolveOperation = resolve;
    });
    const { result, unmount } = renderHook(() => useInPlaceFeedback<string>());
    const pending = result.current.run("copy", () => operation);

    unmount();
    resolveOperation?.(true);

    await expect(pending).resolves.toBeNull();
  });
});
