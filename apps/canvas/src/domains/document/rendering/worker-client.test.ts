import { afterEach, describe, expect, it, vi } from "vitest";
import { createTextRenderingRuntime, DEFAULT_TEXT_RENDER_PROFILE } from "./runtime";
import { TextRenderingWorkerClient } from "./worker-client";

class FakeWorker {
  static latest: FakeWorker | null = null;
  readonly listeners = new Map<string, Set<EventListener>>();
  terminated = false;
  lastMessage: unknown;

  constructor() {
    FakeWorker.latest = this;
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message: unknown) {
    this.lastMessage = message;
  }

  terminate() {
    this.terminated = true;
  }

  emit(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const originalWorker = globalThis.Worker;

afterEach(() => {
  globalThis.Worker = originalWorker;
  FakeWorker.latest = null;
  vi.restoreAllMocks();
});

describe("TextRenderingWorkerClient", () => {
  it("rejects a large render when the worker fails instead of blocking the main thread", async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const runtime = createTextRenderingRuntime({ storage: false });
    const inlineRender = vi.spyOn(runtime, "renderCompact");
    const client = new TextRenderingWorkerClient(runtime);
    const result = client.render("x".repeat(50_000), "#fff");

    FakeWorker.latest?.emit("error", new Event("error"));

    await expect(result).rejects.toThrow("worker failed");
    expect(inlineRender).not.toHaveBeenCalled();
    expect(FakeWorker.latest?.terminated).toBe(true);
  });

  it("drops a cancelled worker result", async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const runtime = createTextRenderingRuntime({ storage: false });
    const client = new TextRenderingWorkerClient(runtime);
    const controller = new AbortController();
    const result = client.render("x".repeat(50_000), "#fff", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    client.dispose();
  });

  it("captures the resolved theme in the worker request", async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const client = new TextRenderingWorkerClient(
      createTextRenderingRuntime({ storage: false })
    );
    const result = client.render("x".repeat(50_000), "#fff", {
      themeMode: "dark",
    });

    expect(FakeWorker.latest?.lastMessage).toMatchObject({
      context: { themeMode: "dark" },
    });
    client.dispose();
    await expect(result).rejects.toThrow("disposed");
  });

  it("sends the Markdown wrap preference to the worker", async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const runtime = createTextRenderingRuntime({ storage: false });
    runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, markdownWrapWidth: 100 });
    const client = new TextRenderingWorkerClient(runtime);
    const result = client.render("# " + "word ".repeat(10_000), "#fff");

    expect(FakeWorker.latest?.lastMessage).toMatchObject({
      profile: { markdownWrapEnabled: true, markdownWrapWidth: 100 },
    });
    client.dispose();
    await expect(result).rejects.toThrow("disposed");
  });
});
