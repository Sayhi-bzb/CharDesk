/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { BlackboardRuntime } from "./runtime";

const BlackboardRuntimeContext = createContext<BlackboardRuntime | null>(null);

export const BlackboardRuntimeProvider = ({
  runtime,
  children,
}: {
  runtime: BlackboardRuntime;
  children: ReactNode;
}) => (
  <BlackboardRuntimeContext.Provider value={runtime}>
    {children}
  </BlackboardRuntimeContext.Provider>
);

export const useBlackboardRuntime = () => {
  const runtime = useContext(BlackboardRuntimeContext);
  if (!runtime) throw new Error("BlackboardRuntimeProvider is missing.");
  return runtime;
};

export const useBlackboardRuntimeOptional = () =>
  useContext(BlackboardRuntimeContext);
