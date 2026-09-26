import { useLayoutEffect, type ReactNode } from "react";
import { readUiRuntimeTheme, useUiTheme } from "@chardesk/ui";
import { CanvasAppearanceContext, useCanvasAppearanceRuntime } from "./hooks";
import type { CanvasAppearanceRuntime } from "./runtime";

export function CanvasAppearanceProvider({
  runtime,
  children,
}: Readonly<{ runtime: CanvasAppearanceRuntime; children: ReactNode }>) {
  return (
    <CanvasAppearanceContext.Provider value={runtime}>
      {children}
    </CanvasAppearanceContext.Provider>
  );
}

/** Synchronizes the computed Host theme into the non-React Canvas runtime. */
export function CanvasAppearanceBridge() {
  const runtime = useCanvasAppearanceRuntime();
  const { resolvedTheme } = useUiTheme();

  useLayoutEffect(() => {
    if (!resolvedTheme || typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => {
      if (!root.classList.contains(resolvedTheme)) return;
      runtime.sync(resolvedTheme, readUiRuntimeTheme(root));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const frame = requestAnimationFrame(sync);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [resolvedTheme, runtime]);

  return null;
}
