import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_CURSOR_STORAGE_KEY,
  DEFAULT_CANVAS_CURSOR_PREFERENCE,
  createCanvasCursorRuntime,
} from "./runtime";

describe("Canvas cursor preference", () => {
  it("persists shape and blink without Canvas document state", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    const runtime = createCanvasCursorRuntime({ storage });
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.start();
    runtime.setShape("underline");
    runtime.setBlink(false);
    expect(runtime.getSnapshot()).toEqual({ shape: "underline", blink: false });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      CANVAS_CURSOR_STORAGE_KEY,
      JSON.stringify({ shape: "underline", blink: false })
    );
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("restores a valid preference and rejects malformed storage", () => {
    const valid = createCanvasCursorRuntime({
      storage: {
        getItem: () => JSON.stringify({ shape: "bar", blink: false }),
        setItem: vi.fn(),
      },
    });
    valid.start();
    expect(valid.getSnapshot()).toEqual({ shape: "bar", blink: false });

    const invalid = createCanvasCursorRuntime({
      storage: {
        getItem: () => JSON.stringify({ shape: "circle", blink: "yes" }),
        setItem: vi.fn(),
      },
    });
    invalid.start();
    expect(invalid.getSnapshot()).toEqual(DEFAULT_CANVAS_CURSOR_PREFERENCE);
  });
});
