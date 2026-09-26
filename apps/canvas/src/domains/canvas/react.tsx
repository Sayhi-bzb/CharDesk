/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import type { CanvasState } from "./state/interfaces";
import type { CanvasPersistenceStatus } from "./state/browserPersistence";
import type { CanvasRuntime } from "./runtime";

type CanvasRuntimeContextValue = Pick<
  CanvasRuntime,
  | "store"
  | "documents"
  | "viewport"
  | "commands"
  | "queries"
  | "getState"
  | "subscribe"
  | "dispose"
  | "ready"
  | "getPersistenceSnapshot"
  | "subscribePersistence"
  | "retryPersistence"
  | "retryRestore"
  | "setRetainedCanvasIds"
  | "materializeSession"
  | "getProjectionCacheStats"
  | "setProjectionCacheBudget"
  | "subscribeProjectionCache"
>;

const CanvasRuntimeContext = createContext<CanvasRuntimeContextValue | null>(null);
let canvasRuntimeFallback: CanvasRuntimeContextValue | null = null;

export const configureCanvasRuntimeFallbackForTesting = (
  runtime: CanvasRuntimeContextValue | null
) => {
  canvasRuntimeFallback = runtime;
};

export const CanvasRuntimeProvider = ({
  runtime,
  children,
}: {
  runtime: CanvasRuntimeContextValue;
  children: ReactNode;
}) => (
  <CanvasRuntimeContext.Provider value={runtime}>
    {children}
  </CanvasRuntimeContext.Provider>
);

export const useCanvasRuntime = () => {
  const runtime = useContext(CanvasRuntimeContext) ?? canvasRuntimeFallback;
  if (!runtime) {
    throw new Error("useCanvasRuntime must be used within CanvasRuntimeProvider");
  }
  return runtime;
};

export const useCanvasState = <Selected,>(
  selector: (state: CanvasState) => Selected
) => useStore(useCanvasRuntime().store, selector);

export const useCanvasViewport = () => {
  const viewport = useCanvasRuntime().viewport;
  return useSyncExternalStore(
    viewport.subscribe,
    viewport.getSnapshot,
    viewport.getSnapshot
  );
};

export const useCanvasPersistence = () => {
  const runtime = useCanvasRuntime();
  return useSyncExternalStore(
    runtime.subscribePersistence,
    runtime.getPersistenceSnapshot,
    runtime.getPersistenceSnapshot
  );
};

type CanvasPersistenceSelection = string | number | boolean | null | undefined;

export const useCanvasPersistenceSelector = <Selected extends CanvasPersistenceSelection,>(
  selector: (status: CanvasPersistenceStatus) => Selected
) => {
  const runtime = useCanvasRuntime();
  const getSelectedSnapshot = useCallback(
    () => selector(runtime.getPersistenceSnapshot()),
    [runtime, selector]
  );
  return useSyncExternalStore(
    runtime.subscribePersistence,
    getSelectedSnapshot,
    getSelectedSnapshot
  );
};
