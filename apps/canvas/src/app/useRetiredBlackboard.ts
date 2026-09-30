import { useEffect, useState } from "react";
import { useCanvasRuntime, useCanvasState } from "@/domains/canvas/public";
import { migrateBlackboard } from "./migrateBlackboard";
import { navigateApp } from "@/shared/navigation/workspace-route";

export const useRetiredBlackboard = ({ enabled }: { enabled: boolean }) => {
  const canvas = useCanvasRuntime();
  const activeId = useCanvasState((state) => state.activeCanvasId);
  const [status, setStatus] = useState<{ state: "idle" | "waiting" | "warning"; message: string }>({ state: "idle", message: "" });
  useEffect(() => {
    if (!enabled) return;
    const bound = canvas.getState().canvasSessions.find((session) => session.id === activeId)?.sourceBinding;
    const legacyRoute = window.location.pathname.endsWith("/blackboard");
    const workspaceId = legacyRoute ? new URLSearchParams(window.location.search).get("workspace")
      : bound?.provider === "browser-workspace" ? bound.id : null;
    if (!workspaceId) {
      if (legacyRoute) navigateApp("/workspace");
      return;
    }
    let current = true;
    setStatus({ state: "waiting", message: "Converting saved work" });
    void migrateBlackboard(canvas, workspaceId).then(() => {
      if (current) { setStatus({ state: "idle", message: "" }); navigateApp("/"); }
    }).catch((error: unknown) => {
      if (current) {
        setStatus({ state: "warning", message: error instanceof Error ? error.message : "Conversion failed; original source is retained." });
        navigateApp("/workspace");
      }
    });
    return () => { current = false; };
  }, [canvas, enabled, activeId]);
  return { status, firstFitRevision: 0 };
};
