import type { StateCreator } from "zustand";
import type {
  EditorState,
} from "../interfaces";
import type {
  CanvasImportSnapshot,
  CanvasSession,
  SessionCommands,
} from "@/domains/sessions/public";
import {
  resolveSessionRuntime,
  getSessionCanvasDocumentId,
  stripSessionContent,
  stripSlideDeckContent,
} from "../helpers/storeUtils";
import { activateSlidePage } from "../slideDocumentPages";
import {
  normalizeSessionMode,
  createSessionId,
  isSourceBackedCanvasSession,
  resolveNextSessionName,
} from "@/domains/sessions/public";
import { createSlideDeck } from "@/domains/slides/public";
import type { CanvasSessionSourceParser } from "../sessionImportPort";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import {
  getCollaborationDocumentId,
  sameCollaborationRoom,
} from "@/domains/collaboration/public";
import { createSessionActivationPatch } from "../transitions/editorTransitions";
import { rebuildContentSurface } from "../helpers/gridHelpers";
import type { CanvasDocumentResidency } from "../documentResidencyPort";
import { createGridSurfaceReader } from "../../cell-plane/model";

const activationGenerations = new WeakMap<CanvasDocumentRegistry, number>();

const beginActivation = (documents: CanvasDocumentRegistry) => {
  const generation = (activationGenerations.get(documents) ?? 0) + 1;
  activationGenerations.set(documents, generation);
  return generation;
};

const isCurrentActivation = (
  documents: CanvasDocumentRegistry,
  generation: number
) => activationGenerations.get(documents) === generation;

const getImportedSessionBaseName = (mode: CanvasImportSnapshot["mode"]) => {
  switch (mode) {
    case "structured":
      return "Imported Structured";
    case "freeform":
      return "Imported Canvas";
    case "slide":
      return "Imported Slides";
  }
};

const resolveImportedSessionName = (
  sessions: CanvasSession[],
  preferredName: string
) => {
  const baseName = preferredName.trim() || "Imported Canvas";
  if (!sessions.some((session) => session.name === baseName)) {
    return baseName;
  }

  let index = 2;
  let candidate = `${baseName} ${index}`;
  while (sessions.some((session) => session.name === candidate)) {
    index += 1;
    candidate = `${baseName} ${index}`;
  }
  return candidate;
};

const createImportedSession = (
  sessionId: string,
  name: string,
  snapshot: CanvasImportSnapshot
): CanvasSession => {
  if (snapshot.mode === "slide") {
    return {
      id: sessionId,
      name,
      mode: "slide",
      slideDeck: snapshot.slideDeck,
      scene: [],
      components: [],
      grid: [],
    };
  }

  return snapshot.mode === "structured"
    ? {
        id: sessionId,
        name,
        mode: "structured",
        scene: snapshot.scene,
        components: snapshot.components,
        grid: snapshot.grid,
      }
    : {
        id: sessionId,
        name,
        mode: "freeform",
        scene: snapshot.scene,
        components: snapshot.components,
        grid: snapshot.grid,
      };
};

const destroySessionDocuments = async (
  documents: CanvasDocumentRegistry,
  session: CanvasSession,
  residency?: CanvasDocumentResidency
) => {
  if (residency) await residency.delete(session.id);
  else documents.destroyDocument(session.id);
};

const checkpointActiveSessionViewport = (
  state: Pick<EditorState, "canvasSessions" | "activeCanvasId" | "offset" | "zoom">
): CanvasSession[] =>
  state.canvasSessions.map((session): CanvasSession => {
    if (session.id !== state.activeCanvasId) return session;
    const viewport = {
      offset: { ...state.offset },
      zoom: state.zoom,
    };
    switch (session.mode) {
      case "slide":
        return { ...session, viewport };
      case "structured":
        return { ...session, viewport };
      case "freeform":
        return { ...session, viewport };
    }
  });

const activateSessionRuntime = (
  documents: CanvasDocumentRegistry,
  session: CanvasSession,
  currentTool: EditorState["tool"]
) => {
  const initialRuntime = resolveSessionRuntime(session, currentTool);
  if (session.mode === "slide" && initialRuntime.nextSlideDeck) {
    const activeSlide = initialRuntime.nextSlideDeck.slides.find(
      (slide) => slide.id === initialRuntime.nextSlideDeck?.activeSlideId
    );
    documents.activateDocument(session.id, {
      mode: "slide",
      activePageId: initialRuntime.nextSlideDeck.activeSlideId,
      pages: initialRuntime.nextSlideDeck.slides.map((slide) => ({
        id: slide.id,
        name: slide.name,
        size: slide.size,
        kind: "cell-plane",
        grid: slide.grid,
      })),
      grid: [],
      scene: [],
      components: [],
    });
    if (activeSlide) documents.activatePage(session.id, activeSlide.id);
    return {
      ...initialRuntime,
      nextSlideDeck: stripSlideDeckContent(initialRuntime.nextSlideDeck),
      nextGridEntries: activeSlide
        ? Array.from(documents.getContentReader().materialize())
        : [],
    };
  }
  if (session.mode === "slide") return initialRuntime;
  documents.activateDocument(
    getSessionCanvasDocumentId(session),
    {
      grid:
        initialRuntime.nextMode === "structured"
          ? []
          : initialRuntime.nextGridEntries,
      scene:
        initialRuntime.nextMode === "structured"
          ? initialRuntime.nextScene
          : [],
      components: initialRuntime.nextComponents,
      mode: initialRuntime.nextMode,
    }
  );

  const documentSeed = documents.getDocumentSeed(session.id, session.mode);
  return resolveSessionRuntime(
    documentSeed
      ? {
          ...session,
          grid: documentSeed.grid,
          scene: documentSeed.scene,
          components: documentSeed.components,
        }
      : session,
    currentTool
  );
};

export const createSessionSlice = (
  documents: CanvasDocumentRegistry,
  parseSessionSource: CanvasSessionSourceParser,
  residency?: CanvasDocumentResidency
): StateCreator<
  EditorState,
  [],
  [],
  SessionCommands
> => (set, get) => ({
  createCanvasSession: (mode = "freeform", options) => {
    const state = get();
    const sessionsWithSnapshot = checkpointActiveSessionViewport(state);

    const normalizedMode = normalizeSessionMode(mode);
    const sessionId = createSessionId(sessionsWithSnapshot);
    const newSession: CanvasSession = normalizedMode === "slide"
        ? {
            id: sessionId,
            name: resolveNextSessionName(sessionsWithSnapshot, normalizedMode),
            mode: "slide",
            slideDeck: createSlideDeck({
              initialSlideId: `${sessionId}-slide-1`,
              size: options?.slideSize,
            }),
            scene: [],
            components: [],
            grid: [],
          }
        : normalizedMode === "structured"
        ? {
            id: sessionId,
            name: options?.name?.trim() || resolveNextSessionName(
              sessionsWithSnapshot,
              normalizedMode,
            ),
            mode: "structured",
            scene: [],
            components: [],
            grid: [],
          }
        : {
            id: sessionId,
            name: options?.name?.trim() || resolveNextSessionName(
              sessionsWithSnapshot,
              normalizedMode,
            ),
            mode: "freeform",
            scene: [],
            components: [],
            grid: [],
          };

    const runtime = activateSessionRuntime(documents, newSession, state.tool);
    const nextSessions = [
      ...sessionsWithSnapshot,
      stripSessionContent(newSession),
    ];
    set(
      createSessionActivationPatch(
        nextSessions,
        newSession.id,
        runtime,
        runtime.nextMode === "structured"
          ? undefined
          : rebuildContentSurface(documents).reader
      )
    );
    residency?.touch(newSession.id);
  },
  openSourceSession: (sourceBinding, options) => {
    const state = get();
    const sessionsWithSnapshot = checkpointActiveSessionViewport(state);
    const sessionId = createSessionId(sessionsWithSnapshot);
    const mode = options?.initialMode ?? "freeform";
    const name = options?.name?.trim() || "Blackboard";
    const newSession: CanvasSession = mode === "slide"
      ? {
          id: sessionId,
          name,
          mode: "slide",
          sourceBinding,
          slideDeck: createSlideDeck({ initialSlideId: `${sessionId}-slide-1` }),
          scene: [],
          components: [],
          grid: [],
        }
      : {
          id: sessionId,
          name,
          mode: "freeform",
          sourceBinding,
          scene: [],
          components: [],
          grid: [],
        };
    const nextSessions = [...sessionsWithSnapshot, stripSessionContent(newSession)];
    // Register source ownership before the document lifecycle observes activation.
    // Persistence can then keep the runtime shell ephemeral from its first frame.
    set({ canvasSessions: nextSessions });
    const runtime = activateSessionRuntime(documents, newSession, state.tool);
    set(createSessionActivationPatch(
      nextSessions,
      newSession.id,
      runtime,
      rebuildContentSurface(documents).reader,
    ));
    residency?.touch(newSession.id);
  },
  importCanvasSession: async (raw, options) => {
    const importedSnapshot = await parseSessionSource(raw, {
      sourceName: options?.sourceName,
    });
    const state = get();
    const sessionsWithSnapshot = checkpointActiveSessionViewport(state);
    const sessionId = createSessionId(sessionsWithSnapshot);
    const sessionName = resolveImportedSessionName(
      sessionsWithSnapshot,
      options?.name?.trim() ||
        importedSnapshot.name?.trim() ||
        getImportedSessionBaseName(importedSnapshot.mode)
    );
    const newSession = createImportedSession(
      sessionId,
      sessionName,
      importedSnapshot
    );
    const runtime = activateSessionRuntime(documents, newSession, state.tool);
    const storedSession = stripSessionContent(newSession);
    const nextSessions = [...sessionsWithSnapshot, storedSession];
    set({
      ...createSessionActivationPatch(
        nextSessions,
        newSession.id,
        runtime,
        runtime.nextMode === "structured"
          ? undefined
          : rebuildContentSurface(documents).reader
      ),
      pendingCameraPlacement:
        importedSnapshot.mode === "slide"
          ? null
          : { sessionId: newSession.id, kind: "content-start" },
    });
    residency?.touch(newSession.id);

    return storedSession;
  },
  replaceCanvasSessionSnapshot: (sessionId, snapshot, options) => {
    const state = get();
    const target = state.canvasSessions.find((session) => session.id === sessionId);
    if (!target) throw new Error(`Canvas session not found: ${sessionId}`);
    if (isSourceBackedCanvasSession(target)) {
      throw new Error("Source-backed sessions are updated through their source binding.");
    }
    if (target.mode !== snapshot.mode) {
      throw new Error(
        `Canvas snapshot mode ${snapshot.mode} does not match session mode ${target.mode}`
      );
    }

    const preservedViewport = options.preserveViewport
      ? sessionId === state.activeCanvasId
        ? { offset: { ...state.offset }, zoom: state.zoom }
        : target.viewport
      : undefined;
    const imported = createImportedSession(target.id, target.name, snapshot);
    const replacement: CanvasSession = imported.mode === "slide"
      ? {
          ...imported,
          ...(preservedViewport ? { viewport: preservedViewport } : {}),
        }
      : {
          ...imported,
          ...(target.collaboration ? { collaboration: target.collaboration } : {}),
          ...(preservedViewport ? { viewport: preservedViewport } : {}),
        };
    const storedReplacement = stripSessionContent(replacement);
    const nextSessions = state.canvasSessions.map((session) =>
      session.id === sessionId ? storedReplacement : session
    );
    const runtime = resolveSessionRuntime(replacement, state.tool);

    if (replacement.mode === "slide" && runtime.nextSlideDeck) {
      documents.activateDocument(replacement.id, {
        mode: "slide",
        activePageId: runtime.nextSlideDeck.activeSlideId,
        pages: runtime.nextSlideDeck.slides.map((slide) => ({
          id: slide.id,
          name: slide.name,
          size: slide.size,
          kind: "cell-plane",
          grid: slide.grid,
        })),
        grid: [],
        scene: [],
        components: [],
      }, { replace: true });
      if (sessionId !== state.activeCanvasId) {
        set({ canvasSessions: nextSessions });
        return;
      }
      const active = runtime.nextSlideDeck.slides.find(
        (slide) => slide.id === runtime.nextSlideDeck?.activeSlideId
      );
      if (!active) return;
      const activeGrid = activateSlidePage(
        documents,
        replacement.id,
        active.id,
        active.grid
      );
      if (options.resetHistory) documents.clearHistory();
      set(createSessionActivationPatch(
        nextSessions,
        sessionId,
        { ...runtime, nextSlideDeck: stripSlideDeckContent(runtime.nextSlideDeck) },
        activeGrid
      ));
      return;
    }

    if (sessionId !== state.activeCanvasId) {
      documents.resetDocument(replacement.id, {
        mode: runtime.nextMode,
        grid: runtime.nextMode === "structured" ? [] : runtime.nextGridEntries,
        scene: runtime.nextMode === "structured" ? runtime.nextScene : [],
        components: runtime.nextComponents,
      });
      set({ canvasSessions: nextSessions });
      return;
    }

    documents.activateDocument(
      getSessionCanvasDocumentId(replacement),
      {
        mode: runtime.nextMode,
        grid: runtime.nextMode === "structured" ? [] : runtime.nextGridEntries,
        scene: runtime.nextMode === "structured" ? runtime.nextScene : [],
        components: runtime.nextComponents,
      },
      { replace: true }
    );
    if (options.resetHistory) documents.clearHistory();
    set(createSessionActivationPatch(
      nextSessions,
      sessionId,
      runtime,
      runtime.nextMode === "structured"
        ? undefined
        : rebuildContentSurface(documents).reader
    ));
  },
  applySourceProjection: (sessionId, snapshot, options) => {
    const state = get();
    const target = state.canvasSessions.find((session) => session.id === sessionId);
    if (!isSourceBackedCanvasSession(target)) {
      throw new Error(`Source-backed Canvas session not found: ${sessionId}`);
    }
    const title = options?.title?.trim();
    const viewport = options?.preserveViewport === false
      ? undefined
      : sessionId === state.activeCanvasId
        ? { offset: { ...state.offset }, zoom: state.zoom }
        : target.viewport;
    const retainedSlide = snapshot.mode === "slide" && target.mode === "slide"
      ? target.slideDeck.slides.find(
          (slide) => slide.id === target.slideDeck.activeSlideId,
        )
      : null;
    const retainedSlideId = retainedSlide && snapshot.mode === "slide"
      ? snapshot.slideDeck.slides.find((slide) => slide.name === retainedSlide.name)?.id
      : undefined;
    const replacement: CanvasSession = snapshot.mode === "slide"
      ? {
          id: target.id,
          name: title || target.name,
          mode: "slide",
          sourceBinding: target.sourceBinding,
          slideDeck: retainedSlideId
            ? { ...snapshot.slideDeck, activeSlideId: retainedSlideId }
            : snapshot.slideDeck,
          ...(viewport ? { viewport } : {}),
          grid: [],
          scene: [],
          components: [],
        }
      : {
          id: target.id,
          name: title || target.name,
          mode: "freeform",
          sourceBinding: target.sourceBinding,
          ...(viewport ? { viewport } : {}),
          grid: [],
          scene: [],
          components: [],
        };
    const nextSessions = state.canvasSessions.map((session) =>
      session.id === sessionId ? stripSessionContent(replacement) : session
    );
    if (snapshot.mode === "slide") {
      if (replacement.mode !== "slide") return;
      documents.clearDerivedSurface(sessionId);
      if (sessionId !== state.activeCanvasId) {
        documents.resetDocument(sessionId, {
          mode: "slide",
          activePageId: replacement.slideDeck.activeSlideId,
          pages: replacement.slideDeck.slides.map((slide) => ({
            id: slide.id,
            name: slide.name,
            size: slide.size,
            kind: "cell-plane",
            grid: slide.grid,
          })),
          grid: [],
          scene: [],
          components: [],
        });
        set({ canvasSessions: nextSessions });
        return;
      }
      const runtime = activateSessionRuntime(documents, replacement, state.tool);
      if (options?.resetHistory !== false) documents.clearHistory();
      set(createSessionActivationPatch(
        nextSessions,
        sessionId,
        runtime,
        rebuildContentSurface(documents).reader,
      ));
      return;
    }
    const surface = createGridSurfaceReader(new Map(snapshot.grid));
    if (sessionId !== state.activeCanvasId) {
      if (target.mode === "slide") {
        documents.resetDocument(sessionId, {
          mode: "freeform",
          grid: [],
          scene: [],
          components: [],
        });
      }
      if (documents.getDocument(sessionId)) {
        documents.setDerivedSurface(sessionId, surface);
      }
      set({ canvasSessions: nextSessions });
      return;
    }
    if (target.mode === "slide") {
      documents.activateDocument(sessionId, {
        mode: "freeform",
        grid: [],
        scene: [],
        components: [],
      }, { replace: true });
    }
    documents.setDerivedSurface(sessionId, surface);
    if (options?.resetHistory !== false) documents.clearHistory();
    set(createSessionActivationPatch(
      nextSessions,
      sessionId,
      resolveSessionRuntime(replacement, state.tool),
      rebuildContentSurface(documents).reader,
    ));
  },
  switchCanvasSession: async (canvasId) => {
    const state = get();
    if (canvasId === state.activeCanvasId) {
      residency?.touch(canvasId);
      return true;
    }

    const sessionsWithSnapshot = checkpointActiveSessionViewport(state);
    const target = sessionsWithSnapshot.find(
      (session) => session.id === canvasId
    );
    if (!target) return false;

    const generation = beginActivation(documents);
    if (residency && !await residency.ensureLoaded(target)) return false;
    if (!isCurrentActivation(documents, generation)) return false;

    const runtime = activateSessionRuntime(documents, target, state.tool);
    set(
      createSessionActivationPatch(
        sessionsWithSnapshot,
        canvasId,
        runtime,
        runtime.nextMode === "structured"
          ? undefined
          : rebuildContentSurface(documents).reader
      )
    );
    residency?.touch(canvasId);
    return true;
  },
  removeCanvasSession: async (canvasId) => {
    const state = get();
    if (state.canvasSessions.length <= 1) return false;

    const sessionsWithSnapshot = checkpointActiveSessionViewport(state);
    const removedIndex = sessionsWithSnapshot.findIndex(
      (session) => session.id === canvasId
    );
    if (removedIndex === -1) return false;

    const remaining = sessionsWithSnapshot.filter(
      (session) => session.id !== canvasId
    );
    if (remaining.length === 0) return false;

    if (canvasId !== state.activeCanvasId) {
      set({ canvasSessions: remaining });
      const removedSession = sessionsWithSnapshot[removedIndex];
      await destroySessionDocuments(documents, removedSession, residency);
      return true;
    }

    const nextIndex = Math.min(removedIndex, remaining.length - 1);
    const nextSession = remaining[nextIndex];
    const generation = beginActivation(documents);
    if (residency && !await residency.ensureLoaded(nextSession)) return false;
    if (!isCurrentActivation(documents, generation)) return false;
    const runtime = activateSessionRuntime(documents, nextSession, state.tool);
    set(
      createSessionActivationPatch(
        remaining,
        nextSession.id,
        runtime,
        runtime.nextMode === "structured"
          ? undefined
          : rebuildContentSurface(documents).reader
      )
    );

    await destroySessionDocuments(
      documents,
      sessionsWithSnapshot[removedIndex],
      residency
    );
    residency?.touch(nextSession.id);
    return true;
  },
  renameCanvasSession: (canvasId, nextName) => {
    const name = nextName.trim();
    if (!name) return;
    set((state) => ({
      canvasSessions: state.canvasSessions.map((session) =>
        session.id === canvasId && !isSourceBackedCanvasSession(session)
          ? { ...session, name }
          : session
      ),
    }));
  },
  setCanvasSessionCollaboration: (canvasId, collaboration, role = "host") => {
    const state = get();
    const session = state.canvasSessions.find((item) => item.id === canvasId);
    if (!session || session.mode === "slide" || isSourceBackedCanvasSession(session)) return;
    if (collaboration && collaboration.mode !== session.mode) return;
    if (collaboration) {
      documents.prepareDocumentForCollaboration(
        canvasId,
        {
          mode: session.mode,
          documentVersion: collaboration.documentVersion,
          roomId: collaboration.roomId,
          sharedDocumentId: getCollaborationDocumentId(collaboration),
        }
      );
    } else {
      documents.clearDocumentCollaboration(canvasId);
    }

    set({
      canvasSessions: state.canvasSessions.map((item) =>
        item.mode !== "slide" && !isSourceBackedCanvasSession(item) && item.id === canvasId
          ? {
              ...item,
              collaboration: collaboration ?? undefined,
              collaborationRole: collaboration ? role : undefined,
            }
          : item
      ),
    });
  },
  joinCanvasSessionCollaboration: (collaboration) => {
    const existing = get().canvasSessions.find(
      (session) =>
        session.mode !== "slide" && !isSourceBackedCanvasSession(session) &&
        sameCollaborationRoom(session.collaboration, collaboration)
    );
    if (existing) {
      void get().switchCanvasSession(existing.id);
      return;
    }

    get().createCanvasSession(collaboration.mode);
    const sessionId = get().activeCanvasId;
    get().setCanvasSessionCollaboration(sessionId, collaboration, "guest");
  },
});
