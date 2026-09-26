import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useBlackboardRuntime } from "@/domains/blackboard/public";
import { isBlackboardRoute, isLocalBlackboardReaderRoute } from "./blackboardRoute";
import { useCanvasRuntime, useCanvasState } from "@/domains/canvas/public";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { createBlackboardWorkspaceTarget } from "./blackboardWorkspaceTarget";

type BlackboardModeStatus =
  | { state: "idle" | "current" | "waiting"; message: string }
  | { state: "warning" | "missing"; message: string };

export const useBlackboardWorkspace = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const runtime = useBlackboardRuntime();
  const canvas = useCanvasRuntime();
  const { activeSessionId, activeWorkspaceId } = useCanvasState(useShallow((state) => {
    const session = state.canvasSessions.find(
      (candidate) => candidate.id === state.activeCanvasId,
    );
    return isSourceBackedCanvasSession(session) &&
      session.sourceBinding.provider === "browser-workspace"
      ? { activeSessionId: session.id, activeWorkspaceId: session.sourceBinding.id }
      : { activeSessionId: null, activeWorkspaceId: null };
  }));
  const [status, setStatus] = useState<BlackboardModeStatus>({
    state: "idle",
    message: "",
  });
  const [firstFitRevision, setFirstFitRevision] = useState(0);
  const generationRef = useRef(0);
  const fittedSessionsRef = useRef(new Set<string>());
  const ownsBlackboardRouteRef = useRef(false);

  const project = useCallback(async (sessionId: string, workspaceId: string) => {
    const generation = ++generationRef.current;
    setStatus({ state: "waiting", message: "Compiling" });
    try {
      const compiled = await runtime.compile(workspaceId);
      if (generation !== generationRef.current) return;
      canvas.commands.sessions.applySourceProjection(
        sessionId,
        compiled.snapshot,
        { title: compiled.title, preserveViewport: true },
      );
      if (!fittedSessionsRef.current.has(sessionId)) {
        fittedSessionsRef.current.add(sessionId);
        setFirstFitRevision((revision) => revision + 1);
      }
      setStatus({
        state: compiled.warnings.length > 0 ? "warning" : "current",
        message: compiled.warnings[0] ?? "Current",
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setStatus({
        state: error instanceof Error && error.message.includes("not found")
          ? "missing"
          : "warning",
        message: error instanceof Error ? error.message : "Invalid Blackboard workspace",
      });
    }
  }, [canvas, runtime]);

  useEffect(() => {
    if (!enabled || !activeSessionId || !activeWorkspaceId) {
      generationRef.current += 1;
      setStatus({ state: "idle", message: "" });
      return;
    }
    void project(activeSessionId, activeWorkspaceId);
    return runtime.repository.subscribe((workspaceId) => {
      if (workspaceId === activeWorkspaceId) {
        void project(activeSessionId, activeWorkspaceId);
      }
    });
  }, [activeSessionId, activeWorkspaceId, enabled, project, runtime]);

  useEffect(() => {
    if (!enabled || isLocalBlackboardReaderRoute(window.location)) return;
    if (activeSessionId && isBlackboardRoute(window.location)) {
      ownsBlackboardRouteRef.current = true;
      return;
    }
    if (!activeSessionId && ownsBlackboardRouteRef.current) {
      ownsBlackboardRouteRef.current = false;
      if (!isBlackboardRoute(window.location)) return;
      const params = new URLSearchParams(window.location.search);
      params.delete("workspace");
      const search = params.size > 0 ? `?${params.toString()}` : "";
      const base = window.location.pathname.startsWith("/legacy/") ? "/legacy/" : "/";
      window.history.replaceState(null, "", `${base}${search}`);
    }
  }, [activeSessionId, enabled]);

  useEffect(() => {
    if (!enabled
      || !isBlackboardRoute(window.location)
      || isLocalBlackboardReaderRoute(window.location)) return;
    const params = new URLSearchParams(window.location.search);
    let disposed = false;
    void (async () => {
      await canvas.ready;
      const requestedId = params.get("workspace")?.trim();
      let source = requestedId
        ? await runtime.repository.readWorkspace(requestedId)
        : null;
      const available = source ? [] : await runtime.repository.listWorkspaces();
      source ??= available[0]
        ? await runtime.repository.readWorkspace(available[0].id)
        : null;
      source ??= await runtime.repository.createWorkspace(
        requestedId ? { id: requestedId } : undefined,
      );
      if (disposed) return;
      await createBlackboardWorkspaceTarget({
        blackboard: runtime,
        canvas,
        location: window.location,
        history: window.history,
      }).activateWorkspace(source.workspace.id);
    })();
    return () => { disposed = true; };
  }, [canvas, enabled, runtime]);

  return { status, firstFitRevision };
};
