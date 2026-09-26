import type { BlackboardRuntime } from "@/domains/blackboard/public";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { isBlackboardRoute, isLocalBlackboardReaderRoute } from "./blackboardRoute";

export type BlackboardWorkspaceTarget = Readonly<{
  getActiveWorkspaceId: () => string | null;
  activateWorkspace: (workspaceId: string) => Promise<void>;
}>;

type BlackboardWorkspaceTargetOptions = Readonly<{
  blackboard: BlackboardRuntime;
  canvas: Pick<CanvasRuntime, "getState" | "commands" | "ready">;
  location: Pick<Location, "pathname" | "search">;
  history: Pick<History, "replaceState">;
}>;

export const createBlackboardWorkspaceTarget = ({
  blackboard,
  canvas,
  location,
  history,
}: BlackboardWorkspaceTargetOptions): BlackboardWorkspaceTarget => {
  const getActiveWorkspaceId = () => {
    const state = canvas.getState();
    const session = state.canvasSessions.find(({ id }) => id === state.activeCanvasId);
    if (isSourceBackedCanvasSession(session) &&
        session.sourceBinding.provider === "browser-workspace") {
      return session.sourceBinding.id;
    }
    if (!isBlackboardRoute(location) || isLocalBlackboardReaderRoute(location)) return null;
    return new URLSearchParams(location.search).get("workspace")?.trim() || null;
  };

  const activateWorkspace = async (workspaceId: string) => {
    const source = await blackboard.repository.readWorkspace(workspaceId);
    if (!source) throw new Error(`Blackboard workspace not found: ${workspaceId}`);
    await canvas.ready;
    const existing = canvas.getState().canvasSessions.find(
      (session) => isSourceBackedCanvasSession(session) &&
        session.sourceBinding.provider === "browser-workspace" &&
        session.sourceBinding.id === workspaceId,
    );
    if (existing) await canvas.commands.sessions.switch(existing.id);
    else {
      canvas.commands.sessions.openSource({
        kind: "blackboard",
        provider: "browser-workspace",
        id: workspaceId,
      }, {
        name: source.workspace.title,
      });
    }

    const params = new URLSearchParams(location.search);
    params.set("workspace", workspaceId);
    const base = location.pathname.startsWith("/legacy/") ? "/legacy" : "";
    history.replaceState(null, "", `${base}/blackboard?${params.toString()}`);
  };

  return { getActiveWorkspaceId, activateWorkspace };
};
