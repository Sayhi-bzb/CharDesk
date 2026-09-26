import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDebouncedLocalStoragePersistStorage,
  createDeferredSnapshotPersistStorage,
  createPersistenceCoordinator,
} from "./persistenceCoordinator";

afterEach(() => vi.useRealTimers());

describe("persistence coordinator", () => {
  it("writes only the latest value after the debounce window", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const coordinator = createPersistenceCoordinator({
      write,
      lifecycle: null,
      visibility: null,
    });

    coordinator.schedule(1);
    coordinator.schedule(2);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(2);
  });

  it("defers JSON serialization for Zustand persist storage", () => {
    vi.useFakeTimers();
    const backing = new Map<string, string>();
    const storage = createDebouncedLocalStoragePersistStorage<{ value: number }>(
      () => ({
        getItem: (key) => backing.get(key) ?? null,
        setItem: (key, value) => backing.set(key, value),
        removeItem: (key) => backing.delete(key),
        clear: () => backing.clear(),
        key: (index) => [...backing.keys()][index] ?? null,
        get length() {
          return backing.size;
        },
      })
    );

    storage.setItem("editor", { state: { value: 1 }, version: 5 });
    storage.setItem("editor", { state: { value: 2 }, version: 5 });
    expect(backing.has("editor")).toBe(false);
    vi.advanceTimersByTime(500);
    expect(JSON.parse(backing.get("editor")!)).toEqual({
      state: { value: 2 },
      version: 5,
    });
  });

  it("treats malformed storage envelopes as absent", () => {
    const backing = new Map<string, string>([
      ["invalid-json", "{"],
      ["missing-state", JSON.stringify({ version: 5 })],
      ["invalid-version", JSON.stringify({ state: {}, version: "5" })],
    ]);
    const storage = createDebouncedLocalStoragePersistStorage<object>(() => ({
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: (key) => backing.delete(key),
      clear: () => backing.clear(),
      key: (index) => [...backing.keys()][index] ?? null,
      get length() {
        return backing.size;
      },
    }));

    expect(storage.getItem("invalid-json")).toBeNull();
    expect(storage.getItem("missing-state")).toBeNull();
    expect(storage.getItem("invalid-version")).toBeNull();
  });

  it("builds snapshots only after durable state settles", () => {
    vi.useFakeTimers();
    const backing = new Map<string, string>();
    const createSnapshot = vi.fn((state: { durable: object; hover: object }) => ({
      durable: state.durable,
    }));
    const storage = createDeferredSnapshotPersistStorage({
      getStorage: () => ({
        getItem: (key) => backing.get(key) ?? null,
        setItem: (key, value) => backing.set(key, value),
        removeItem: (key) => backing.delete(key),
        clear: () => backing.clear(),
        key: (index) => [...backing.keys()][index] ?? null,
        get length() {
          return backing.size;
        },
      }),
      createSnapshot,
      shouldSchedule: (previous, next) =>
        !previous || previous.durable !== next.durable,
    });
    const durable = {};

    storage.setItem("editor", {
      state: { durable, hover: {} },
      version: 5,
    });
    storage.setItem("editor", {
      state: { durable, hover: {} },
      version: 5,
    });
    expect(createSnapshot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);

    expect(createSnapshot).toHaveBeenCalledOnce();
    expect(JSON.parse(backing.get("editor")!).state).toEqual({ durable: {} });
  });
});
