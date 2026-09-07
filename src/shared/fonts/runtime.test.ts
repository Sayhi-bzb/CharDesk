import { describe, expect, it, vi } from "vitest";
import { CANVAS_FONT_STORAGE_KEY, createCanvasFontRuntime } from "./runtime";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Host Canvas font preference", () => {
  it("commits only the latest loaded selection and persists no document data", async () => {
    const ark = deferred();
    const xiaolai = deferred();
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const runtime = createCanvasFontRuntime({ storage, load: (font) => font === "ark-mono" ? ark.promise : xiaolai.promise });
    const first = runtime.select("ark-mono");
    const second = runtime.select("xiaolai-mono");
    expect(runtime.getSnapshot()).toMatchObject({ font: "maple", requestedFont: "xiaolai-mono", status: "loading" });
    xiaolai.resolve();
    await second;
    ark.resolve();
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
    await runtime.select("ark-mono");
    expect(runtime.getSnapshot()).toMatchObject({ font: "maple", requestedFont: "ark-mono", status: "error", profile: original });
    await runtime.select(runtime.getSnapshot().requestedFont);
    expect(runtime.getSnapshot()).toMatchObject({ font: "ark-mono", status: "idle" });
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

  it("works in memory when storage throws and does not publish after disposal", async () => {
    const runtime = createCanvasFontRuntime({ storage: {
      getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); },
    }, load: async () => {} });
    runtime.start();
    await runtime.select("ark-mono");
    expect(runtime.getSnapshot().font).toBe("ark-mono");
    const pending = runtime.select("xiaolai-mono");
    runtime.dispose();
    await pending;
    expect(runtime.getSnapshot().font).toBe("ark-mono");
  });

  it("leaves loading state after a timeout without committing a late result", async () => {
    vi.useFakeTimers();
    try {
      const task = deferred();
      const runtime = createCanvasFontRuntime({ load: () => task.promise });
      const pending = runtime.select("ark-mono");
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
