import type { PersistStorage, StorageValue } from "zustand/middleware";

type TimerPort = {
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

const defaultTimerPort: TimerPort = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

type PersistenceCoordinator<T> = {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
  dispose: () => void;
};

const decodeStorageValue = <S>(raw: string): StorageValue<S> | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("state" in value)) return null;
    const version = "version" in value ? value.version : undefined;
    if (version !== undefined && typeof version !== "number") return null;
    // This adapter validates the Zustand envelope; the owning persistence
    // decoder validates its state payload during migration/merge.
    return value as StorageValue<S>;
  } catch {
    return null;
  }
};

/** Keeps serialization and storage I/O off high-frequency editor updates. */
export const createPersistenceCoordinator = <T>({
  delay = 500,
  write,
  timer = defaultTimerPort,
  lifecycle = typeof window === "undefined" ? null : window,
  visibility = typeof document === "undefined" ? null : document,
}: {
  delay?: number;
  write: (value: T) => void;
  timer?: TimerPort;
  lifecycle?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  visibility?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> | null;
}): PersistenceCoordinator<T> => {
  let pending: T | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = () => {
    if (timerHandle === null) return;
    timer.clearTimeout(timerHandle);
    timerHandle = null;
  };
  const flush = () => {
    cancelTimer();
    if (pending === null) return;
    const value = pending;
    pending = null;
    write(value);
  };
  const handleVisibilityChange = () => {
    if (visibility?.visibilityState === "hidden") flush();
  };
  lifecycle?.addEventListener("pagehide", flush);
  visibility?.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    schedule: (value) => {
      pending = value;
      cancelTimer();
      timerHandle = timer.setTimeout(flush, delay);
    },
    flush,
    cancel: () => {
      cancelTimer();
      pending = null;
    },
    dispose: () => {
      flush();
      lifecycle?.removeEventListener("pagehide", flush);
      visibility?.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
};

export const createDebouncedLocalStoragePersistStorage = <S>(
  getStorage: () => Storage,
  delay = 500
): PersistStorage<S> => {
  const coordinator = createPersistenceCoordinator<{
    name: string;
    value: StorageValue<S>;
  }>({
    delay,
    write: ({ name, value }) => getStorage().setItem(name, JSON.stringify(value)),
  });

  return {
    getItem: (name) => {
      const raw = getStorage().getItem(name);
      return raw ? decodeStorageValue<S>(raw) : null;
    },
    setItem: (name, value) => {
      coordinator.schedule({ name, value });
    },
    removeItem: (name) => {
      coordinator.cancel();
      getStorage().removeItem(name);
    },
  };
};

export const createDeferredSnapshotPersistStorage = <S, P>({
  getStorage,
  createSnapshot,
  shouldSchedule = () => true,
  delay = 500,
}: {
  getStorage: () => Storage;
  createSnapshot: (state: S) => P;
  shouldSchedule?: (previous: S | null, next: S) => boolean;
  delay?: number;
}): PersistStorage<S> => {
  let previousState: S | null = null;
  const coordinator = createPersistenceCoordinator<{
    name: string;
    value: StorageValue<S>;
  }>({
    delay,
    write: ({ name, value }) =>
      getStorage().setItem(
        name,
        JSON.stringify({ ...value, state: createSnapshot(value.state) })
      ),
  });

  return {
    getItem: (name) => {
      const raw = getStorage().getItem(name);
      return raw ? decodeStorageValue<S>(raw) : null;
    },
    setItem: (name, value) => {
      const nextState = value.state;
      const schedule = shouldSchedule(previousState, nextState);
      previousState = nextState;
      if (schedule) coordinator.schedule({ name, value });
    },
    removeItem: (name) => {
      previousState = null;
      coordinator.cancel();
      getStorage().removeItem(name);
    },
  };
};
