import { useSyncExternalStore } from "react";
import { useCollaborationRuntime } from "@/domains/collaboration/public";

export const useCollaborationSnapshot = () => {
  const collaboration = useCollaborationRuntime();
  return useSyncExternalStore(
    collaboration.subscribe,
    collaboration.getSnapshot,
    collaboration.getSnapshot
  );
};
