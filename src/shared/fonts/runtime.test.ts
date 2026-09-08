import { describe, expect, it, vi } from "vitest";
import { displayFontOptions } from "./catalog";
import { CANVAS_FONT_STORAGE_KEY, createCanvasFontRuntime } from "./runtime";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Host Canvas font preference", () => {
  it.each(["fusion-mono", "xiaolai-mono"] as const)(
    "%s derives one-pixel bold overdraw without a bold face",
    (font) => {
      const profile = displayFontOptions[font].profile;
      expect(profile.capabilities.display.boldStrategy).toBe("overdraw");
      expect(profile.capabilities.cjk.boldStrategy).toBe("overdraw");
      expect(profile.capabilities.display.boldOverdrawEm).toBe(1 / 15);
      expect(profile.capabilities.cjk.boldOverdrawEm).toBe(1 / 15);
      expect(profile.capabilities.nerd.boldStrategy).toBe("none");
      expect(profile.capabilities.emoji.boldStrategy).toBe("none");
      expect(profile.capabilities.nerd.boldOverdrawEm).toBe(0);
      expect(profile.capabilities.emoji.boldOverdrawEm).toBe(0);
    }
  );

  it("commits only the latest loaded selection and persists no document data", async () => {
    const fusion = deferred();
    const xiaolai = deferred();
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const runtime = createCanvasFontRuntime({ storage, load: (font) => font === "fusion-mono" ? fusion.promise : xiaolai.promise });
    const first = runtime.select("fusion-mono");
    const second = runtime.select("xiaolai-mono");
    expect(runtime.getSnapshot()).toMatchObject({ font: "maple", requestedFont: "xiaolai-mono", status: "loading" });
    xiaolai.resolve();
    await second;
    fusion.resolve();
    await first;
    expect(runtime.getSnapshot()).toMatchObject({ font: "xiaolai-mono", status: "idle" });
    expect(runtime.getSnapshot().profile.capabilities.display.families.regular).toContain("Xiaolai");
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(CANVAS_FONT_STORAGE_KEY, "xiaolai-mono");
    runtime.dispose();
  });

  it("retains the effective profile on failure and retries the requested font", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const runtime = createCanvasFontRuntime({ load });
    const original = runtime.getSnapshot().profile;
    await runtime.select("fusion-mono");
    expect(runtime.getSnapshot()).toMatchObject({ font: "maple", requestedFont: "fusion-mono", status: "error", profile: original });
    await runtime.select(runtime.getSnapshot().requestedFont);
    expect(runtime.getSnapshot()).toMatchObject({ font: "fusion-mono", status: "idle" });
  });

  it.each(["xiaolai-mono", "invalid", null])("restores %s with safe decoding", async (stored) => {
    const load = vi.fn().mockResolvedValue(undefined);
    const runtime = createCanvasFontRuntime({ storage: { getItem: () => stored, setItem: vi.fn() }, load });
    runtime.start();
    runtime.start();
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("idle"));
    expect(load).toHaveBeenCalledExactlyOnceWith(stored === "xiaolai-mono" ? stored : "maple");
    runtime.dispose();
  });

  it("migrates the retired Ark preference to Fusion after a successful load", async () => {
    const setItem = vi.fn();
    const load = vi.fn().mockResolvedValue(undefined);
    const runtime = createCanvasFontRuntime({
      storage: { getItem: () => "ark-mono", setItem },
      load,
    });
    runtime.start();
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("idle"));
    expect(load).toHaveBeenCalledExactlyOnceWith("fusion-mono");
    expect(runtime.getSnapshot()).toMatchObject({
      font: "fusion-mono", requestedFont: "fusion-mono",
    });
    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      CANVAS_FONT_STORAGE_KEY, "fusion-mono",
    );
    runtime.dispose();
  });

  it("works in memory when storage throws and does not publish after disposal", async () => {
    const runtime = createCanvasFontRuntime({ storage: {
      getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); },
    }, load: async () => {} });
    runtime.start();
    await runtime.select("fusion-mono");
    expect(runtime.getSnapshot().font).toBe("fusion-mono");
    const pending = runtime.select("xiaolai-mono");
    runtime.dispose();
    await pending;
    expect(runtime.getSnapshot().font).toBe("fusion-mono");
  });

  it("leaves loading state after a timeout without committing a late result", async () => {
    vi.useFakeTimers();
    try {
      const task = deferred();
      const runtime = createCanvasFontRuntime({ load: () => task.promise });
      const pending = runtime.select("fusion-mono");
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;
      expect(runtime.getSnapshot()).toMatchObject({ status: "error", font: "maple" });
      task.resolve();
      await Promise.resolve();
      expect(runtime.getSnapshot().font).toBe("maple");
      runtime.dispose();
    } finally { vi.useRealTimers(); }
  });
});
