import { useEffect, useMemo, useRef } from "react";
import {
  useCanvasRuntime,
  useCanvasState,
} from "@/domains/canvas/public";
import {
  buildCollaborationUrl,
  parseCollaborationUrl,
  sameCollaborationRoom,
  stripCollaborationUrl,
  useCollaborationRuntime,
} from "@/domains/collaboration/public";
import { getStaticGridSelectionAreas } from "@/domains/selection/public";

export const useActiveCollaboration = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const canvas = useCanvasRuntime();
  const collaborationRuntime = useCollaborationRuntime();
  const incomingCollaboration = useMemo(
    () =>
      typeof window === "undefined"
        ? { status: "none" as const }
        : parseCollaborationUrl(),
    []
  );
  const pendingIncomingCollaboration = useRef(
    incomingCollaboration.status === "valid" ? incomingCollaboration.descriptor : null
  );
  const preserveIncomingError = useRef(
    incomingCollaboration.status === "invalid" ||
      incomingCollaboration.status === "unsupported" ||
      incomingCollaboration.status === "retired"
  );
  const activeCanvasId = useCanvasState((state) => state.activeCanvasId);
  const collaboration = useCanvasState((state) =>
    state.canvasSessions.find((session) => session.id === state.activeCanvasId)?.collaboration
  );
  const collaborationRole = useCanvasState((state) =>
    state.canvasSessions.find((session) => state.activeCanvasId === session.id)
      ?.collaborationRole ?? "host"
  );
  const canvasMode = useCanvasState((state) => state.canvasMode);
  const staticGridSelection = useCanvasState((state) => state.interaction.staticGridSelection);
  const contentSurface = useCanvasState((state) => state.contentSurface);
  const selection = useMemo(
    () => {
      if (canvasMode === "freeform") {
        return {
          mode: "freeform" as const,
          areas: getStaticGridSelectionAreas(
            staticGridSelection,
            contentSurface.reader
          ),
        };
      }
      return undefined;
    },
    [canvasMode, contentSurface, staticGridSelection]
  );
  const tool = useCanvasState((state) => state.tool);
  const joinCollaboration = canvas.commands.sessions.joinCollaboration;

  useEffect(() => {
    if (!enabled) return;
    const incoming = pendingIncomingCollaboration.current;
    if (!incoming) return;
    if (sameCollaborationRoom(collaboration, incoming)) {
      pendingIncomingCollaboration.current = null;
      return;
    }
    joinCollaboration(incoming);
  }, [canvas, collaboration, enabled, joinCollaboration]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const incoming = pendingIncomingCollaboration.current;
    if (incoming && !sameCollaborationRoom(collaboration, incoming)) return;
    if (incoming) pendingIncomingCollaboration.current = null;

    if (!collaboration && preserveIncomingError.current) return;
    preserveIncomingError.current = false;
    const nextUrl = collaboration
      ? buildCollaborationUrl(collaboration)
      : stripCollaborationUrl();
    if (nextUrl !== window.location.href) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [collaboration, enabled]);

  useEffect(() => {
    if (!enabled) {
      void collaborationRuntime.disconnect();
      return;
    }
    if (!collaboration) {
      void collaborationRuntime.disconnect();
      return;
    }
    const document = canvas.queries.getCollaborationDocument(activeCanvasId);
    if (document) {
      void collaborationRuntime.connect(collaboration, document, collaborationRole);
    }
    return () => { void collaborationRuntime.disconnect(); };
  }, [
    activeCanvasId,
    canvas,
    collaboration,
    collaborationRole,
    collaborationRuntime,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled || !collaboration) return;
    collaborationRuntime.setPresence({ selection, tool });
  }, [collaboration, collaborationRuntime, enabled, selection, tool]);
};
