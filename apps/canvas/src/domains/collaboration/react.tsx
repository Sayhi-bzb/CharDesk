/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { CollaborationRuntime } from "./runtime";

const CollaborationRuntimeContext = createContext<CollaborationRuntime | null>(null);
let collaborationRuntimeFallback: CollaborationRuntime | null = null;

export const configureCollaborationRuntimeFallbackForTesting = (
  runtime: CollaborationRuntime | null
) => {
  collaborationRuntimeFallback = runtime;
};

export const CollaborationRuntimeProvider = ({
  runtime,
  children,
}: {
  runtime: CollaborationRuntime;
  children: ReactNode;
}) => (
  <CollaborationRuntimeContext.Provider value={runtime}>
    {children}
  </CollaborationRuntimeContext.Provider>
);

export const useCollaborationRuntime = () => {
  const runtime = useContext(CollaborationRuntimeContext) ?? collaborationRuntimeFallback;
  if (!runtime) {
    throw new Error(
      "useCollaborationRuntime must be used within CollaborationRuntimeProvider"
    );
  }
  return runtime;
};
