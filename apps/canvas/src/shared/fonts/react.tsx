import { useEffect, type ReactNode } from "react";
import type { CanvasFontRuntime } from "./runtime";
import { CanvasFontContext } from "./hooks";

export function CanvasFontProvider({ runtime, children }: { runtime: CanvasFontRuntime; children: ReactNode }) {
  useEffect(() => { runtime.start(); }, [runtime]);
  return <CanvasFontContext.Provider value={runtime}>{children}</CanvasFontContext.Provider>;
}
