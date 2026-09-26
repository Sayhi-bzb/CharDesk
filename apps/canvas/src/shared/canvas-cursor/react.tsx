import {
  useEffect,
  type ReactNode,
} from "react";
import type { CanvasCursorRuntime } from "./runtime";
import { CanvasCursorContext } from "./hooks";

export function CanvasCursorProvider({
  runtime,
  children,
}: Readonly<{ runtime: CanvasCursorRuntime; children: ReactNode }>) {
  useEffect(() => runtime.start(), [runtime]);
  return <CanvasCursorContext.Provider value={runtime}>{children}</CanvasCursorContext.Provider>;
}
