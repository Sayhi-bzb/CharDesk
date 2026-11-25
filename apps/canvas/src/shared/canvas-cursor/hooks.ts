import { createContext, useContext, useSyncExternalStore } from "react";
import { createCanvasCursorRuntime } from "./runtime";

export const CanvasCursorContext = createContext(createCanvasCursorRuntime());

export const useCanvasCursorRuntime = () => useContext(CanvasCursorContext);

export const useCanvasCursor = () => {
  const runtime = useCanvasCursorRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
};
