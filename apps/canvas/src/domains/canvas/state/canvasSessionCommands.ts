import type {
  EditorState,
} from "./interfaces";
import type {
  CanvasImportSnapshot,
  CanvasSessionDescriptor,
  SessionCommands,
} from "@/domains/sessions/public";
import {
  resolveSessionDocumentRuntime,
} from "./helpers/storeUtils";
import { readSlideDeckDescriptor } from "./slideDocumentPages";
import {
  normalizeSessionMode,
  createSessionId,
  isSourceBackedCanvasSession,
  resolveNextSessionName,
} from "@/domains/sessions/public";
import {
  createSlideDeck,
  type SlideDeckSnapshot,
} from "@/domains/slides/public";
import type { CanvasSessionSourceParser } from "./sessionImportPort";
import type {
  CanvasDocumentRegistry,
  CanvasDocumentSeed,
} from "./CanvasDocumentRegistry";
import {
  getCollaborationDocumentId,
  sameCollaborationRoom,
} from "@/domains/collaboration/public";
import { createSessionActivationPatch } from "./transitions/editorTransitions";
import { rebuildContentSurface } from "./helpers/gridHelpers";
import type { CanvasDocumentResidency } from "./documentResidencyPort";
import { createGridSurfaceReader } from "../cell-plane/model";
import type { CanvasViewportRuntime } from "../viewportRuntime";
import { normalizeCanvasViewport } from "../viewportRuntime";
import type { CanvasStateCommitCoordinator } from "./CanvasStateCommitCoordinator";
import { CanvasSessionActivationCoordinator } from "./CanvasSessionActivationCoordinator";

const getImportedSessionBaseName = (mode: CanvasImportSnapshot["mode"]) => {
  return mode === "slide" ? "Imported Slides" : "Imported Canvas";
};

const resolveImportedSessionName = (
  sessions: CanvasSessionDescriptor[],
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

const createImportedSessionDescriptor = (
  sessionId: string,
  name: string,
  snapshot: CanvasImportSnapshot
): CanvasSessionDescriptor => ({ id: sessionId, name, mode: snapshot.mode });

const createDocumentSeed = (
  snapshot: CanvasImportSnapshot
): CanvasDocumentSeed =>
  snapshot.mode === "slide"
    ? {
        mode: "slide",
        activePageId: snapshot.slideDeck.activeSlideId,
        pages: snapshot.slideDeck.slides.map((slide) => ({
          id: slide.id,
          name: slide.name,
          size: slide.size,
          kind: "cell-plane",
          grid: slide.grid,
        })),
        grid: [],
      }
    : {
        mode: snapshot.mode,
        grid: snapshot.grid,
      };

const createBlankSnapshot = (
  mode: CanvasSessionDescriptor["mode"],
  sessionId: string,
  slideDeck?: SlideDeckSnapshot
): CanvasImportSnapshot =>
  mode === "slide"
    ? {
        mode,
        slideDeck:
          slideDeck ??
          createSlideDeck({ initialSlideId: `${sessionId}-slide-1` }),
      }
    : { mode, grid: [] };

const replaceDocumentSnapshot = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  snapshot: CanvasImportSnapshot,
  replace = true
) => {
  const seed = createDocumentSeed(snapshot);
  documents.activateDocument(sessionId, seed, { replace });
};

const releaseSessionDocuments = (
  documents: CanvasDocumentRegistry,
  session: CanvasSessionDescriptor,
  residency?: CanvasDocumentResidency
) => {
  if (residency) residency.releaseDeleted(session.id);
  else documents.destroyDocument(session.id);
};

const checkpointActiveSessionViewport = (
  state: Pick<EditorState, "canvasSessions" | "activeCanvasId">,
  viewport: ReturnType<CanvasViewportRuntime["getSnapshot"]>
): CanvasSessionDescriptor[] =>
  state.canvasSessions.map((session) =>
    session.id === state.activeCanvasId
      ? { ...session, viewport: normalizeCanvasViewport(viewport) }
      : session
  );

const activateSessionRuntime = (
  documents: CanvasDocumentRegistry,
  session: CanvasSessionDescriptor,
  currentTool: EditorState["tool"]
) => {
  const address = documents.getDocumentAddress(session.id);
  if (!address || !documents.activatePage(address.documentId, address.pageId)) {
    throw new Error(`Canvas document not loaded: ${session.id}`);
  }
  return resolveSessionDocumentRuntime(documents, session, currentTool);
};

export const createCanvasSessionCommands = (
  commits: CanvasStateCommitCoordinator,
  documents: CanvasDocumentRegistry,
  parseSessionSource: CanvasSessionSourceParser,
  viewportRuntime: CanvasViewportRuntime,
  residency?: CanvasDocumentResidency
): SessionCommands => {
  const get = commits.getState;
  const set = commits.setState;
  const activation = new CanvasSessionActivationCoordinator();
  const pendingDeletionIds = new Set<string>();
  const commands: SessionCommands = {
    createCanvasSession: (mode = "freeform", options) => commits.run(() => {
      activation.begin();
      const state = get();
      const sessionsWithSnapshot = checkpointActiveSessionViewport(
        state,
        viewportRuntime.getSnapshot()
      );

      const normalizedMode = normalizeSessionMode(mode);
      const sessionId = createSessionId(sessionsWithSnapshot);
      const newSession: CanvasSessionDescriptor = {
        id: sessionId,
        name:
          options?.name?.trim() ||
          resolveNextSessionName(sessionsWithSnapshot, normalizedMode),
        mode: normalizedMode,
      };
      const snapshot = createBlankSnapshot(
        normalizedMode,
        sessionId,
        normalizedMode === "slide"
          ? createSlideDeck({
              initialSlideId: `${sessionId}-slide-1`,
              size: options?.slideSize,
            })
          : undefined
      );

      replaceDocumentSnapshot(documents, sessionId, snapshot, false);
      const runtime = activateSessionRuntime(documents, newSession, state.tool);
      const nextSessions = [...sessionsWithSnapshot, newSession];
      set(
        createSessionActivationPatch(
          nextSessions,
          newSession.id,
          runtime,
          rebuildContentSurface(documents).reader,
          documents.getActiveAddress()
        )
      );
      viewportRuntime.resetFallback(normalizeCanvasViewport(newSession.viewport));
      residency?.touch(newSession.id);
    }),
    openSourceSession: (sourceBinding, options) => commits.run(() => {
      activation.begin();
      const state = get();
      const sessionsWithSnapshot = checkpointActiveSessionViewport(
        state,
        viewportRuntime.getSnapshot()
      );
      const sessionId = createSessionId(sessionsWithSnapshot);
      const mode = options?.initialMode ?? "freeform";
      const name = options?.name?.trim() || "Blackboard";
      const newSession: CanvasSessionDescriptor = {
        id: sessionId,
        name,
        mode,
        sourceBinding,
      };
      const nextSessions = [...sessionsWithSnapshot, newSession];
      // Register source ownership before the document lifecycle observes activation.
      // Persistence can then keep the runtime shell ephemeral from its first frame.
      set({ canvasSessions: nextSessions });
      replaceDocumentSnapshot(
        documents,
        sessionId,
        createBlankSnapshot(mode, sessionId),
        false
      );
      const runtime = activateSessionRuntime(documents, newSession, state.tool);
      set(createSessionActivationPatch(
        nextSessions,
        newSession.id,
        runtime,
        rebuildContentSurface(documents).reader,
        documents.getActiveAddress(),
      ));
      viewportRuntime.resetFallback(normalizeCanvasViewport(newSession.viewport));
      residency?.touch(newSession.id);
    }),
    importCanvasSession: async (raw, options) => {
      const intent = activation.begin();
      const importedSnapshot = await parseSessionSource(raw, {
        sourceName: options?.sourceName,
      });
      return commits.run(() => {
      const state = get();
      const sessionsWithSnapshot = checkpointActiveSessionViewport(
        state,
        viewportRuntime.getSnapshot()
      );
      const sessionId = createSessionId(sessionsWithSnapshot);
      const sessionName = resolveImportedSessionName(
        sessionsWithSnapshot,
        options?.name?.trim() ||
          importedSnapshot.name?.trim() ||
          getImportedSessionBaseName(importedSnapshot.mode)
      );
      const newSession = createImportedSessionDescriptor(
        sessionId,
        sessionName,
        importedSnapshot
      );
      const nextSessions = [...sessionsWithSnapshot, newSession];
      if (!activation.isCurrent(intent)) {
        documents.registerDocument(
          sessionId,
          createDocumentSeed(importedSnapshot)
        );
        set({ canvasSessions: nextSessions });
        residency?.touch(newSession.id);
        return newSession;
      }
      replaceDocumentSnapshot(documents, sessionId, importedSnapshot, false);
      const runtime = activateSessionRuntime(documents, newSession, state.tool);
      set(createSessionActivationPatch(
        nextSessions,
        newSession.id,
        runtime,
        rebuildContentSurface(documents).reader,
        documents.getActiveAddress()
      ));
      viewportRuntime.resetFallback(normalizeCanvasViewport(newSession.viewport));
      if (importedSnapshot.mode !== "slide") {
        viewportRuntime.requestPlacement({
          sessionId: newSession.id,
          kind: "content-start",
        });
      }
      residency?.touch(newSession.id);

        return newSession;
      });
    },
    replaceCanvasSessionSnapshot: (sessionId, snapshot, options) => commits.run(() => {
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
          ? normalizeCanvasViewport(viewportRuntime.getSnapshot())
          : target.viewport
        : undefined;
      const replacement: CanvasSessionDescriptor = {
        ...target,
        ...(preservedViewport ? { viewport: preservedViewport } : {}),
      };
      const nextSessions = state.canvasSessions.map((session) =>
        session.id === sessionId ? replacement : session
      );

      if (sessionId !== state.activeCanvasId) {
        documents.resetDocument(replacement.id, createDocumentSeed(snapshot));
        set({ canvasSessions: nextSessions });
        return;
      }

      replaceDocumentSnapshot(documents, replacement.id, snapshot);
      const runtime = activateSessionRuntime(documents, replacement, state.tool);
      if (options.resetHistory) documents.clearHistory();
      set(createSessionActivationPatch(
        nextSessions,
        sessionId,
        runtime,
        rebuildContentSurface(documents).reader,
        documents.getActiveAddress()
      ));
      viewportRuntime.resetFallback(normalizeCanvasViewport(replacement.viewport));
    }),
    applySourceProjection: (sessionId, snapshot, options) => commits.run(() => {
      const state = get();
      const target = state.canvasSessions.find((session) => session.id === sessionId);
      if (!isSourceBackedCanvasSession(target)) {
        throw new Error(`Source-backed Canvas session not found: ${sessionId}`);
      }
      const title = options?.title?.trim();
      const viewport = options?.preserveViewport === false
        ? undefined
        : sessionId === state.activeCanvasId
          ? normalizeCanvasViewport(viewportRuntime.getSnapshot())
          : target.viewport;
      const currentSlideDeck = target.mode === "slide"
        ? sessionId === state.activeCanvasId
          ? state.slideDeck
          : readSlideDeckDescriptor(documents, sessionId)
        : null;
      const retainedSlide = snapshot.mode === "slide" && currentSlideDeck
        ? currentSlideDeck.slides.find(
            (slide) => slide.id === currentSlideDeck.activeSlideId,
          )
        : null;
      const retainedSlideId = retainedSlide && snapshot.mode === "slide"
        ? snapshot.slideDeck.slides.find((slide) => slide.name === retainedSlide.name)?.id
        : undefined;
      const replacement: CanvasSessionDescriptor = {
        id: target.id,
        name: title || target.name,
        mode: snapshot.mode,
        sourceBinding: target.sourceBinding,
        ...(viewport ? { viewport } : {}),
      };
      const nextSessions = state.canvasSessions.map((session) =>
        session.id === sessionId ? replacement : session
      );
      if (snapshot.mode === "slide") {
        const slideSnapshot = retainedSlideId
          ? {
              ...snapshot,
              slideDeck: { ...snapshot.slideDeck, activeSlideId: retainedSlideId },
            }
          : snapshot;
        documents.clearDerivedSurface(sessionId);
        if (sessionId !== state.activeCanvasId) {
          documents.resetDocument(sessionId, createDocumentSeed(slideSnapshot));
          set({ canvasSessions: nextSessions });
          return;
        }
        replaceDocumentSnapshot(documents, sessionId, slideSnapshot);
        const runtime = activateSessionRuntime(documents, replacement, state.tool);
        if (options?.resetHistory !== false) documents.clearHistory();
        set(createSessionActivationPatch(
          nextSessions,
          sessionId,
          runtime,
          rebuildContentSurface(documents).reader,
          documents.getActiveAddress(),
        ));
        viewportRuntime.resetFallback(normalizeCanvasViewport(replacement.viewport));
        return;
      }
      const surface = createGridSurfaceReader(new Map(snapshot.grid));
      if (sessionId !== state.activeCanvasId) {
        if (target.mode === "slide") {
          documents.resetDocument(sessionId, {
            mode: "freeform",
            grid: [],
          });
        }
        if (documents.getDocument(sessionId)) {
          documents.setDerivedSurface(sessionId, surface);
        }
        set({ canvasSessions: nextSessions });
        return;
      }
      if (target.mode === "slide") {
        replaceDocumentSnapshot(documents, sessionId, snapshot);
      }
      documents.setDerivedSurface(sessionId, surface);
      if (options?.resetHistory !== false) documents.clearHistory();
      set(createSessionActivationPatch(
        nextSessions,
        sessionId,
        activateSessionRuntime(documents, replacement, state.tool),
        rebuildContentSurface(documents).reader,
        documents.getActiveAddress(),
      ));
      viewportRuntime.resetFallback(normalizeCanvasViewport(replacement.viewport));
    }),
    switchCanvasSession: async (canvasId) => {
      const intent = activation.begin();
      const initialState = get();
      if (canvasId === initialState.activeCanvasId) {
        residency?.touch(canvasId);
        return true;
      }
      const target = initialState.canvasSessions.find(
        (session) => session.id === canvasId
      );
      if (!target) return false;

      if (residency && !await residency.ensureLoaded({ descriptor: target })) return false;
      if (!activation.isCurrent(intent)) return false;

      return commits.run(() => {
        if (!activation.isCurrent(intent)) return false;
        const state = get();
        const latestTarget = state.canvasSessions.find(
          (session) => session.id === canvasId
        );
        if (!latestTarget) return false;
        const sessionsWithSnapshot = checkpointActiveSessionViewport(
          state,
          viewportRuntime.getSnapshot()
        );
        const runtime = activateSessionRuntime(documents, latestTarget, state.tool);
        set(createSessionActivationPatch(
          sessionsWithSnapshot,
          canvasId,
          runtime,
          rebuildContentSurface(documents).reader,
          documents.getActiveAddress()
        ));
        viewportRuntime.resetFallback(normalizeCanvasViewport(latestTarget.viewport));
        residency?.touch(canvasId);
        return true;
      });
    },
    removeCanvasSession: async (canvasId) => {
      const initialState = get();
      if (pendingDeletionIds.has(canvasId)) return false;
      const availableSessions = initialState.canvasSessions.filter(
        (session) => !pendingDeletionIds.has(session.id)
      );
      if (availableSessions.length <= 1) return false;
      const removedIndex = initialState.canvasSessions.findIndex(
        (session) => session.id === canvasId
      );
      if (removedIndex === -1) return false;
      const removedSession = initialState.canvasSessions[removedIndex];
      pendingDeletionIds.add(canvasId);

      try {
        let preferredNextId: string | null = null;
        if (canvasId === initialState.activeCanvasId) {
          activation.begin();
          const initialRemaining = initialState.canvasSessions.filter(
            (session) => session.id !== canvasId
          );
          const nextIndex = Math.min(removedIndex, initialRemaining.length - 1);
          const nextSession = initialRemaining[nextIndex];
          preferredNextId = nextSession.id;
          if (
            residency &&
            !await residency.ensureLoaded({ descriptor: nextSession })
          ) {
            return false;
          }
        }

        if (residency) await residency.tombstone(removedSession.id);
        const removed = commits.run(() => {
          const state = get();
          const currentIndex = state.canvasSessions.findIndex(
            (session) => session.id === canvasId
          );
          if (currentIndex === -1) return false;
          const remaining = state.canvasSessions.filter(
            (session) => session.id !== canvasId
          );
          if (remaining.length === 0) {
            throw new Error("Canvas runtime requires at least one session");
          }
          if (state.activeCanvasId !== canvasId) {
            set({ canvasSessions: remaining });
            return true;
          }

          const latestNext = remaining.find(
            (session) => session.id === preferredNextId
          ) ?? remaining[Math.min(currentIndex, remaining.length - 1)]!;
          const sessionsWithSnapshot = checkpointActiveSessionViewport(
            state,
            viewportRuntime.getSnapshot()
          ).filter((session) => session.id !== canvasId);
          const runtime = activateSessionRuntime(documents, latestNext, state.tool);
          set(createSessionActivationPatch(
            sessionsWithSnapshot,
            latestNext.id,
            runtime,
            rebuildContentSurface(documents).reader,
            documents.getActiveAddress()
          ));
          viewportRuntime.resetFallback(normalizeCanvasViewport(latestNext.viewport));
          residency?.touch(latestNext.id);
          return true;
        });
        if (!removed) return false;

        releaseSessionDocuments(documents, removedSession, residency);
        return true;
      } finally {
        pendingDeletionIds.delete(canvasId);
      }
    },
    saveCanvasSessionViewport: (canvasId, nextViewport) => commits.run(() => {
      const viewport = normalizeCanvasViewport(nextViewport);
      set((state) => {
        const current = state.canvasSessions.find((session) => session.id === canvasId);
        if (!current) return state;
        if (
          current.viewport?.zoom === viewport.zoom &&
          current.viewport.offset.x === viewport.offset.x &&
          current.viewport.offset.y === viewport.offset.y
        ) return state;
        return {
          canvasSessions: state.canvasSessions.map((session) =>
            session.id === canvasId ? { ...session, viewport } : session
          ),
        };
      });
    }),
    renameCanvasSession: (canvasId, nextName) => commits.run(() => {
      const name = nextName.trim();
      if (!name) return;
      set((state) => ({
        canvasSessions: state.canvasSessions.map((session) =>
          session.id === canvasId && !isSourceBackedCanvasSession(session)
            ? { ...session, name }
            : session
        ),
      }));
    }),
    setCanvasSessionCollaboration: (canvasId, collaboration, role = "host") => commits.run(() => {
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
    }),
    joinCanvasSessionCollaboration: (collaboration) => commits.run(() => {
      const existing = get().canvasSessions.find(
        (session) =>
          session.mode !== "slide" && !isSourceBackedCanvasSession(session) &&
          sameCollaborationRoom(session.collaboration, collaboration)
      );
      if (existing) {
        void commands.switchCanvasSession(existing.id);
        return;
      }

      commands.createCanvasSession(collaboration.mode);
      const sessionId = get().activeCanvasId;
      commands.setCanvasSessionCollaboration(sessionId, collaboration, "guest");
    }),
  };
  return commands;
};
