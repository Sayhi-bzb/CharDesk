import { afterEach, describe, expect, it, vi } from "vitest";
import { createClipboardShortcutCoordinator } from "./clipboardShortcutCoordinator";

describe("createClipboardShortcutCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels the fallback when the native event arrives first", () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const coordinator = createClipboardShortcutCoordinator({ onFallback });

    coordinator.begin("paste");

    expect(coordinator.handleNative("paste")).toBe("dispatch");
    vi.advanceTimersByTime(150);
    expect(onFallback).not.toHaveBeenCalled();
    expect(coordinator.handleNative("paste")).toBe("suppress");
  });

  it("suppresses a native event that arrives after the fallback", () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const coordinator = createClipboardShortcutCoordinator({ onFallback });

    coordinator.begin("paste");
    vi.advanceTimersByTime(150);

    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledWith("paste");
    expect(coordinator.handleNative("paste")).toBe("suppress");
  });

  it.each(["copy", "cut"] as const)(
    "uses the same late-native suppression for %s",
    (actionId) => {
      vi.useFakeTimers();
      const onFallback = vi.fn();
      const coordinator = createClipboardShortcutCoordinator({ onFallback });

      coordinator.begin(actionId);
      vi.advanceTimersByTime(150);

      expect(onFallback).toHaveBeenCalledWith(actionId);
      expect(coordinator.handleNative(actionId)).toBe("suppress");
    }
  );

  it("allows two distinct keydown and native event pairs", () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const coordinator = createClipboardShortcutCoordinator({ onFallback });

    coordinator.begin("paste");
    expect(coordinator.handleNative("paste")).toBe("dispatch");
    coordinator.begin("paste");
    expect(coordinator.handleNative("paste")).toBe("dispatch");

    vi.advanceTimersByTime(150);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("dispatches a standalone menu clipboard event", () => {
    const coordinator = createClipboardShortcutCoordinator({
      onFallback: vi.fn(),
    });

    expect(coordinator.handleNative("paste")).toBe("dispatch");
  });

  it("cancels pending timers on dispose", () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const coordinator = createClipboardShortcutCoordinator({ onFallback });

    coordinator.begin("paste");
    coordinator.dispose();
    vi.runAllTimers();

    expect(onFallback).not.toHaveBeenCalled();
  });

  it("reports attempt ids and arbitration stages", () => {
    vi.useFakeTimers();
    const onTrace = vi.fn();
    const coordinator = createClipboardShortcutCoordinator({
      onFallback: vi.fn(),
      onTrace,
    });

    coordinator.begin("paste");
    vi.advanceTimersByTime(150);
    coordinator.handleNative("paste");

    expect(onTrace.mock.calls.map(([trace]) => trace)).toMatchObject([
      { attemptId: 1, actionId: "paste", stage: "keydown" },
      { attemptId: 1, actionId: "paste", stage: "fallback-scheduled" },
      { attemptId: 1, actionId: "paste", stage: "fallback-dispatched" },
      { attemptId: 1, actionId: "paste", stage: "native-suppressed" },
    ]);
  });
});
