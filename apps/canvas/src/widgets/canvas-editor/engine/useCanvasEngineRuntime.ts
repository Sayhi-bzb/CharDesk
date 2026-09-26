import { CanvasEngineRuntime } from "./CanvasEngineRuntime";
import { useCanvasViewOptional } from './CanvasWorkspace';

let canvasEngineRuntimeFallback: CanvasEngineRuntime | null = null;

export const configureCanvasEngineRuntimeFallbackForTesting = (
  runtime: CanvasEngineRuntime | null
) => {
  canvasEngineRuntimeFallback = runtime;
};

export const useCanvasEngineRuntime = (): CanvasEngineRuntime => {
  const view = useCanvasViewOptional();
  if (!view?.runtime && !canvasEngineRuntimeFallback) {
    throw new Error("useCanvasEngineRuntime requires an active canvas workspace");
  }
  return view?.runtime ?? canvasEngineRuntimeFallback!;
};
