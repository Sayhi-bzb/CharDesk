import { createContext, useContext, useSyncExternalStore } from "react";
import { createCanvasFontRuntime } from "./runtime";

// Unhosted previews retain the default, without persistence or automatic loading.
export const CanvasFontContext = createContext(createCanvasFontRuntime());
export const useCanvasFontRuntime = () => useContext(CanvasFontContext);
export function useCanvasFont() {
  const runtime = useCanvasFontRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}
