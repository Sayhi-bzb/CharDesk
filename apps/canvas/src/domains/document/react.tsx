/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { TextRenderingRuntime } from "./rendering/runtime";
import type { TextRenderThemeMode } from "./rendering/types";

const TextRenderingContext = createContext<TextRenderingRuntime | null>(null);
let textRenderingRuntimeFallback: TextRenderingRuntime | null = null;

export const configureTextRenderingRuntimeFallbackForTesting = (
  runtime: TextRenderingRuntime | null
) => {
  textRenderingRuntimeFallback = runtime;
};

export const TextRenderingProvider = ({
  runtime,
  children,
}: {
  runtime: TextRenderingRuntime;
  children: ReactNode;
}) => (
  <TextRenderingContext.Provider value={runtime}>
    {children}
  </TextRenderingContext.Provider>
);

export const useTextRenderingRuntime = () => {
  const runtime = useContext(TextRenderingContext) ?? textRenderingRuntimeFallback;
  if (!runtime) throw new Error("useTextRenderingRuntime must be used within TextRenderingProvider");
  return runtime;
};

export const useTextRenderProfile = () => {
  const runtime = useTextRenderingRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getProfile, runtime.getProfile);
};

export const useResolvedContentTheme = (mode?: TextRenderThemeMode) => {
  const runtime = useTextRenderingRuntime();
  useSyncExternalStore(runtime.subscribe, runtime.getProfile, runtime.getProfile);
  return runtime.getResolvedTheme(mode === "dark" ? "dark" : "light");
};
