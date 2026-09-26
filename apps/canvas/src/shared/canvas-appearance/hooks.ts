import { createContext, useContext, useSyncExternalStore } from "react";
import { createCanvasAppearanceRuntime } from "./runtime";

export const CanvasAppearanceContext = createContext(
  createCanvasAppearanceRuntime()
);

export const useCanvasAppearanceRuntime = () =>
  useContext(CanvasAppearanceContext);

export function useCanvasAppearance() {
  const runtime = useCanvasAppearanceRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  );
}
