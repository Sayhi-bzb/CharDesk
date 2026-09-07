import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CollaborationDescriptor } from "@/domains/collaboration/public";
import type { SlideSize } from "@/domains/slides/public";
import type { Point } from "@/shared/types";
import type { CanvasMode } from "./mode";
import type { CanvasSourceBinding } from "./model";
import { migrateLegacyGridViewport } from "./viewportMigration";

export const CANVAS_CATALOG_DATABASE = "chardesk-canvas-catalog";
export const CANVAS_CATALOG_VERSION = 4;
export const CANVAS_CATALOG_MARKER_KEY = "chardesk-canvas-catalog-ready-v1";

export type CanvasCatalogPreferences = {
  brushChar: string;
  brushColor: string;
  brushBackgroundColor: string;
  showGrid: boolean;
  exportShowGrid: boolean;
};

export type CanvasCatalogSession = {
  id: string;
  order?: number;
  name: string;
  mode: CanvasMode;
  sourceBinding?: CanvasSourceBinding;
  viewport?: { offset: Point; zoom: number };
  collaboration?: CollaborationDescriptor;
  collaborationRole?: "host" | "guest";
  activeSlideId?: string;
  documentGeneration?: number;
  previousDocumentGeneration?: number;
};

export type CanvasCatalogSlide = {
  id: string;
  sessionId: string;
  name: string;
  size: SlideSize;
  order: number;
};

export type CanvasCatalogSnapshot = {
  revision: number;
  activeSessionId: string;
  sessions: CanvasCatalogSession[];
  slides: CanvasCatalogSlide[];
  preferences: CanvasCatalogPreferences;
  recoveredSources: string[];
  deletedSessionIds: string[];
};

interface CanvasCatalogSchema extends DBSchema {
  workspace: {
    key: "current";
    value: {
      id: "current";
      schemaVersion: typeof CANVAS_CATALOG_VERSION;
      activeSessionId: string;
      migrationComplete: boolean;
      revision?: number;
      recoveredSources?: string[];
      deletedSessionIds?: string[];
    };
  };
  sessions: {
    key: string;
    value: CanvasCatalogSession;
  };
  slides: {
    key: [string, string];
    value: CanvasCatalogSlide;
    indexes: { "by-session": string };
  };
  preferences: {
    key: "canvas";
    value: CanvasCatalogPreferences & { id: "canvas" };
  };
}

export type CanvasCatalog = {
  load: () => Promise<CanvasCatalogSnapshot | null>;
  save: (snapshot: CanvasCatalogSnapshot) => Promise<void>;
  close: () => void;
};

export type CanvasCatalogFailureReason =
  | "upgrade-blocked"
  | "storage-timeout"
  | "storage-unavailable";

export class CanvasCatalogOpenError extends Error {
  readonly reason: CanvasCatalogFailureReason;

  constructor(reason: CanvasCatalogFailureReason, message: string) {
    super(message);
    this.name = "CanvasCatalogOpenError";
    this.reason = reason;
  }
}

export type CanvasCatalogOpenOptions = {
  openTimeoutMs?: number;
  onUnavailable?: (reason: CanvasCatalogFailureReason) => void;
};

const CATALOG_OPEN_TIMEOUT = 5_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const decodeSourceBinding = (
  value: unknown,
  legacyWorkspaceId?: unknown,
): CanvasSourceBinding | undefined => {
  if (value && typeof value === "object") {
    const binding = value as Partial<CanvasSourceBinding>;
    if (binding.kind === "blackboard" &&
        (binding.provider === "browser-workspace" || binding.provider === "local-reader") &&
        typeof binding.id === "string" && binding.id.trim()) {
      return { kind: binding.kind, provider: binding.provider, id: binding.id };
    }
  }
  if (typeof legacyWorkspaceId !== "string" || !legacyWorkspaceId.trim()) return undefined;
  return {
    kind: "blackboard",
    provider: legacyWorkspaceId === "local-reader" ? "local-reader" : "browser-workspace",
    id: legacyWorkspaceId,
  };
};

const readLegacyWorkspaceId = (value: unknown) =>
  isRecord(value) ? value.workspaceId : undefined;

const normalizeCatalogSession = (value: CanvasCatalogSession): CanvasCatalogSession | null => {
  const storedMode: unknown = value.mode;
  const mode = storedMode === "blackboard" ? "freeform" : storedMode;
  if (mode !== "freeform" && mode !== "structured" && mode !== "slide") return null;
  const sourceBinding = mode === "structured"
    ? undefined
    : decodeSourceBinding(value.sourceBinding, readLegacyWorkspaceId(value));
  const collaboration = sourceBinding ? undefined : value.collaboration;
  return {
    id: value.id,
    ...(value.order === undefined ? {} : { order: value.order }),
    name: value.name,
    mode,
    ...(sourceBinding ? { sourceBinding } : {}),
    ...(value.viewport ? { viewport: value.viewport } : {}),
    ...(collaboration ? {
      collaboration,
      collaborationRole: value.collaborationRole === "guest" ? "guest" : "host",
    } : {}),
    ...(value.activeSlideId === undefined
      ? {}
      : { activeSlideId: value.activeSlideId }),
    ...(value.documentGeneration === undefined
      ? {}
      : { documentGeneration: value.documentGeneration }),
    ...(value.previousDocumentGeneration === undefined
      ? {}
      : { previousDocumentGeneration: value.previousDocumentGeneration }),
  };
};

const openCatalog = async ({
  openTimeoutMs = CATALOG_OPEN_TIMEOUT,
  onUnavailable,
}: CanvasCatalogOpenOptions): Promise<IDBPDatabase<CanvasCatalogSchema>> => {
  let database: IDBPDatabase<CanvasCatalogSchema> | null = null;
  let rejectInterruption!: (error: CanvasCatalogOpenError) => void;
  let settled = false;
  const interruption = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  const opening = openDB<CanvasCatalogSchema>(
    CANVAS_CATALOG_DATABASE,
    CANVAS_CATALOG_VERSION,
    {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore("workspace", { keyPath: "id" });
          db.createObjectStore("sessions", { keyPath: "id" });
          const slides = db.createObjectStore("slides", {
            keyPath: ["sessionId", "id"],
          });
          slides.createIndex("by-session", "sessionId");
          db.createObjectStore("preferences", { keyPath: "id" });
          return;
        }
        if (oldVersion >= CANVAS_CATALOG_VERSION) return;

        const sessionStore = transaction.objectStore("sessions");
        let cursor = await sessionStore.openCursor();
        while (cursor) {
          const session = cursor.value;
          if (session.viewport) {
            await cursor.update({
              ...session,
              viewport: migrateLegacyGridViewport(session.viewport),
            });
          }
          cursor = await cursor.continue();
        }

        const workspaceStore = transaction.objectStore("workspace");
        const workspace = await workspaceStore.get("current");
        if (workspace) {
          await workspaceStore.put({
            ...workspace,
            schemaVersion: CANVAS_CATALOG_VERSION,
          });
        }
      },
      blocked() {
        rejectInterruption(new CanvasCatalogOpenError(
          "upgrade-blocked",
          "Canvas catalog upgrade is blocked by another tab"
        ));
      },
      blocking() {
        database?.close();
        onUnavailable?.("storage-unavailable");
      },
      terminated() {
        onUnavailable?.("storage-unavailable");
      },
    }
  );
  const timeout = setTimeout(() => {
    rejectInterruption(new CanvasCatalogOpenError(
      "storage-timeout",
      "Canvas catalog did not open in time"
    ));
  }, openTimeoutMs);
  void opening.then((opened) => {
    if (settled) opened.close();
  }).catch(() => undefined);

  try {
    database = await Promise.race([opening, interruption]);
    return database;
  } catch (error) {
    if (error instanceof CanvasCatalogOpenError) throw error;
    throw new CanvasCatalogOpenError(
      "storage-unavailable",
      error instanceof Error ? error.message : "Canvas catalog is unavailable"
    );
  } finally {
    settled = true;
    clearTimeout(timeout);
  }
};

export const createIndexedDbCanvasCatalog = async (
  options: CanvasCatalogOpenOptions = {}
): Promise<CanvasCatalog> => {
  const db = await openCatalog(options);
  return {
    load: async () => {
      const transaction = db.transaction(
        ["workspace", "sessions", "slides", "preferences"],
        "readonly"
      );
      const [workspace, sessions, slides, preferences] = await Promise.all([
        transaction.objectStore("workspace").get("current"),
        transaction.objectStore("sessions").getAll(),
        transaction.objectStore("slides").getAll(),
        transaction.objectStore("preferences").get("canvas"),
      ]);
      await transaction.done;
      if (!workspace?.migrationComplete || !preferences) return null;
      const canvasPreferences: CanvasCatalogPreferences = {
        brushChar: preferences.brushChar,
        brushColor: preferences.brushColor,
        brushBackgroundColor: preferences.brushBackgroundColor,
        showGrid: preferences.showGrid,
        exportShowGrid: preferences.exportShowGrid,
      };
      return {
        revision: workspace.revision ?? 0,
        activeSessionId: workspace.activeSessionId,
        sessions: sessions.map(normalizeCatalogSession)
          .filter((session): session is CanvasCatalogSession => session !== null)
          .sort(
          (left, right) => (left.order ?? 0) - (right.order ?? 0)
        ),
        slides: slides.sort((left, right) => left.order - right.order),
        preferences: canvasPreferences,
        recoveredSources: workspace.recoveredSources ?? [],
        deletedSessionIds: workspace.deletedSessionIds ?? [],
      };
    },
    save: async (snapshot) => {
      const transaction = db.transaction(
        ["workspace", "sessions", "slides", "preferences"],
        "readwrite"
      );
      const sessionStore = transaction.objectStore("sessions");
      const slideStore = transaction.objectStore("slides");
      await Promise.all([
        sessionStore.clear(),
        slideStore.clear(),
        transaction.objectStore("workspace").put({
          id: "current",
          schemaVersion: CANVAS_CATALOG_VERSION,
          activeSessionId: snapshot.activeSessionId,
          migrationComplete: true,
          revision: snapshot.revision,
          recoveredSources: snapshot.recoveredSources,
          deletedSessionIds: snapshot.deletedSessionIds,
        }),
        transaction.objectStore("preferences").put({
          id: "canvas",
          ...snapshot.preferences,
        }),
      ]);
      await Promise.all([
        ...snapshot.sessions.map((session) => sessionStore.put(session)),
        ...snapshot.slides.map((slide) => slideStore.put(slide)),
      ]);
      await transaction.done;
    },
    close: () => db.close(),
  };
};
