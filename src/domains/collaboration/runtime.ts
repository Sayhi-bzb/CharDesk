import { Awareness } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { EncryptedRelayProvider } from "./encrypted-relay-provider";
import {
  ensureCollaborationDocumentMeta,
  getCollaborationPersistenceName,
  getCollaborationRoomName,
} from "./document";
import { resolveCollaborationEndpoint } from "./room-link";
import {
  buildCollaborationPresence,
  readCollaborationPeers,
  type CollaborationAwareness,
} from "./presence";
import { sameCollaborationRoom } from "./room-link";
import type {
  CollaborationDescriptor,
  CollaborationIntegrityIssue,
  CollaborationSnapshot,
} from "./model";

type Listener = () => void;

type PersistenceAdapter = {
  whenSynced: Promise<unknown>;
  destroy: () => Promise<unknown> | void;
  clearData: () => Promise<unknown>;
};

type NetworkProviderAdapter = {
  on: (event: string, callback: (event: unknown) => void) => void;
  destroy: () => void;
};

type CollaborationRuntimeDependencies = {
  createPersistence: (descriptor: CollaborationDescriptor, doc: Y.Doc) => Promise<PersistenceAdapter>;
  createAwareness: (doc: Y.Doc) => CollaborationAwareness;
  createProvider: (
    descriptor: CollaborationDescriptor,
    doc: Y.Doc,
    awareness: CollaborationAwareness
  ) => NetworkProviderAdapter;
};

const DEFAULT_DEPENDENCIES: CollaborationRuntimeDependencies = {
  createPersistence: async (descriptor, doc) =>
    new IndexeddbPersistence(await getCollaborationPersistenceName(descriptor), doc),
  createAwareness: (doc) => new Awareness(doc) as unknown as CollaborationAwareness,
  createProvider: (descriptor, doc, awareness) => {
    const endpoint = resolveCollaborationEndpoint(descriptor);
    if (!endpoint) throw new Error("Collaboration service unavailable");
    return descriptor.version === 6
      ? new WebsocketProvider(endpoint, getCollaborationRoomName(descriptor), doc, {
          awareness: awareness as unknown as Awareness,
        }) as unknown as NetworkProviderAdapter
      : new EncryptedRelayProvider(endpoint, descriptor.roomId, descriptor.key, doc, {
          awareness: awareness as unknown as Awareness,
        });
  },
};

const MAX_INTEGRITY_ISSUES = 50;
type CollaborationPresenceInput = NonNullable<
  Parameters<typeof buildCollaborationPresence>[1]
>;

const hasLocalDocumentContent = (doc: Y.Doc) => {
  const pages = doc.getMap<{ id?: unknown }>("document-pages");
  for (const [pageId, descriptor] of pages) {
    if (descriptor?.id !== pageId) continue;
    const prefix = `canvas-page:${encodeURIComponent(pageId)}:`;
    if (doc.getArray(prefix + "cell-plane-operations").length > 0) {
      return true;
    }
  }
  return false;
};

const EMPTY_SNAPSHOT: CollaborationSnapshot = {
  descriptor: null,
  documentStatus: "idle",
  connectionStatus: "idle",
  canEdit: true,
  peers: [],
  error: null,
  errorKind: null,
  hasLocalCopy: false,
  integrityIssues: [],
};

export { ensureCollaborationDocumentMeta, getCollaborationPersistenceName } from "./document";

class CollaborationSession {
  private provider: NetworkProviderAdapter | null = null;
  private persistence: PersistenceAdapter | null = null;
  private awareness: CollaborationAwareness | null = null;
  private metaObserver: (() => void) | null = null;
  private providerSynced = false;
  private awaitingInitialRemote = false;
  private remoteDocumentReady = false;
  private disposed = false;
  private presence: CollaborationPresenceInput = {};
  readonly descriptor: CollaborationDescriptor;
  private readonly doc: Y.Doc;
  private readonly publish: (patch: Partial<CollaborationSnapshot>) => void;
  private readonly dependencies: CollaborationRuntimeDependencies;
  private readonly role: "host" | "guest";

  constructor(
    descriptor: CollaborationDescriptor,
    doc: Y.Doc,
    role: "host" | "guest",
    publish: (patch: Partial<CollaborationSnapshot>) => void,
    dependencies: CollaborationRuntimeDependencies
  ) {
    this.descriptor = descriptor;
    this.doc = doc;
    this.role = role;
    this.publish = publish;
    this.dependencies = dependencies;
  }

  async start() {
    let documentReady = false;
    try {
      const persistence = await this.dependencies.createPersistence(this.descriptor, this.doc);
      if (this.disposed) {
        await persistence.destroy();
        return;
      }
      this.persistence = persistence;
      await persistence.whenSynced;
      if (this.disposed) return;

      const hasLocalCopy = hasLocalDocumentContent(this.doc);
      this.awaitingInitialRemote = this.role === "guest" && !hasLocalCopy;
      ensureCollaborationDocumentMeta(this.descriptor, this.doc);
      const meta = this.doc.getMap<unknown>("document-meta");
      this.metaObserver = () => {
        if (this.disposed) return;
        try {
          ensureCollaborationDocumentMeta(this.descriptor, this.doc);
        } catch (error) {
          this.publishIncompatibleDocument(error);
        }
      };
      meta.observe(this.metaObserver);

      const awareness = this.dependencies.createAwareness(this.doc);
      this.awareness = awareness;
      this.publishPresence();
      awareness.on("change", () => {
        if (this.disposed) return;
        const { peers, issues } = readCollaborationPeers(awareness, this.descriptor.mode);
        this.remoteDocumentReady = peers.some((peer) => peer.documentReady === true);
        this.publish({ peers, integrityIssues: issues.slice(0, MAX_INTEGRITY_ISSUES) });
        this.publishInitialRemoteReady();
      });

      this.publish({
        documentStatus: this.awaitingInitialRemote ? "joining" : "ready",
        connectionStatus: "connecting",
        canEdit: !this.awaitingInitialRemote,
        hasLocalCopy,
      });
      documentReady = true;
      this.connectProvider(awareness);
    } catch (error) {
      if (this.disposed) return;
      const incompatible =
        error instanceof Error && error.message === "Incompatible collaboration document";
      const providerFailure = documentReady && !incompatible;
      this.publish({
        documentStatus: incompatible
          ? "incompatible"
          : providerFailure && this.awaitingInitialRemote
            ? "joining"
            : providerFailure
              ? "ready"
              : "error",
        connectionStatus: "offline",
        canEdit: providerFailure && !this.awaitingInitialRemote,
        errorKind: incompatible
          ? "incompatible-document"
          : providerFailure
            ? "provider"
            : "persistence",
        error: error instanceof Error ? error.message : "Collaboration failed",
      });
    }
  }

  private publishIncompatibleDocument(error: unknown) {
    this.publish({
      documentStatus: "incompatible",
      canEdit: false,
      errorKind: "incompatible-document",
      error: error instanceof Error ? error.message : "Incompatible collaboration document",
    });
  }

  private connectProvider(awareness: CollaborationAwareness) {
    const provider = this.dependencies.createProvider(this.descriptor, this.doc, awareness);
    this.provider = provider;
    provider.on("status", (event) => {
      if (this.disposed) return;
      const { status } = event as { status: "connected" | "disconnected" | "connecting" };
      this.publish({
        connectionStatus:
          status === "connected" ? "online" : status === "connecting" ? "connecting" : "offline",
      });
    });
    provider.on("connection-error", () => {
      if (this.disposed) return;
      this.publish({
        connectionStatus: "offline",
        errorKind: "provider",
        error: "Connection failed",
      });
    });
    provider.on("sync", (event) => {
      const isSynced = event as boolean;
      if (this.disposed || !isSynced) return;
      this.providerSynced = true;
      this.publishPresence();
      try {
        ensureCollaborationDocumentMeta(this.descriptor, this.doc);
        this.publishInitialRemoteReady();
      } catch (error) {
        this.publishIncompatibleDocument(error);
      }
    });
  }

  private publishInitialRemoteReady() {
    if (!this.awaitingInitialRemote || !this.providerSynced || !this.remoteDocumentReady) return;
    this.awaitingInitialRemote = false;
    this.publish({ documentStatus: "ready", canEdit: true, hasLocalCopy: true });
  }

  setPresence(input: CollaborationPresenceInput) {
    this.presence = input;
    this.publishPresence();
  }

  private publishPresence() {
    this.awareness?.setLocalState(buildCollaborationPresence(this.descriptor, this.presence, {
      role: this.role,
      documentReady: this.providerSynced,
    }));
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.provider?.destroy();
    this.provider = null;
    this.awareness?.destroy();
    this.awareness = null;
    if (this.metaObserver) this.doc.getMap("document-meta").unobserve(this.metaObserver);
    this.metaObserver = null;
    if (this.persistence) await this.persistence.destroy();
    this.persistence = null;
  }

  async clearPersistence() {
    await this.persistence?.clearData();
  }
}

export class CollaborationRuntime {
  private snapshot = EMPTY_SNAPSHOT;
  private listeners = new Set<Listener>();
  private session: CollaborationSession | null = null;
  private presence: CollaborationPresenceInput = {};
  private generation = 0;
  private connectionInput: {
    descriptor: CollaborationDescriptor;
    doc: Y.Doc;
    role: "host" | "guest";
  } | null = null;
  private readonly dependencies: CollaborationRuntimeDependencies;

  constructor(dependencies: Partial<CollaborationRuntimeDependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<CollaborationSnapshot>) {
    if (
      patch.connectionStatus === "online" &&
      this.snapshot.errorKind === "provider"
    ) {
      patch.error = null;
      patch.errorKind = null;
    }
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async connect(
    descriptor: CollaborationDescriptor,
    doc: Y.Doc,
    role: "host" | "guest" = "host"
  ) {
    this.connectionInput = { descriptor, doc, role };
    const generation = ++this.generation;
    const previousSession = this.session;
    this.session = null;
    await previousSession?.dispose();
    if (this.generation !== generation) return;
    this.publish({
      ...EMPTY_SNAPSHOT,
      descriptor,
      documentStatus: "restoring",
      connectionStatus: "idle",
      canEdit: false,
    });
    const session = new CollaborationSession(descriptor, doc, role, (patch) => {
      if (this.generation !== generation || this.session !== session) return;
      if (patch.integrityIssues) {
        const documentIssues = this.snapshot.integrityIssues.filter(
          (issue) => issue.channel !== "presence"
        );
        patch.integrityIssues = [...documentIssues, ...patch.integrityIssues].slice(
          0,
          MAX_INTEGRITY_ISSUES
        );
      }
      this.publish(patch);
    }, this.dependencies);
    this.session = session;
    session.setPresence(this.presence);
    await session.start();
  }

  setPresence(presence: CollaborationPresenceInput) {
    this.presence = presence;
    this.session?.setPresence(presence);
  }

  reportIntegrityIssues(issues: CollaborationIntegrityIssue[]) {
    if (!this.session) return;
    const presenceIssues = this.snapshot.integrityIssues.filter(
      (issue) => issue.channel === "presence"
    );
    this.publish({
      integrityIssues: [...issues, ...presenceIssues].slice(0, MAX_INTEGRITY_ISSUES),
    });
  }

  async disconnect() {
    this.connectionInput = null;
    const generation = ++this.generation;
    const session = this.session;
    this.session = null;
    await session?.dispose();
    if (this.generation === generation) this.publish(EMPTY_SNAPSHOT);
  }

  async retry() {
    const input = this.connectionInput;
    if (!input) return;
    await this.connect(input.descriptor, input.doc, input.role);
  }

  async forget(descriptor: CollaborationDescriptor) {
    const isActive = sameCollaborationRoom(this.snapshot.descriptor ?? undefined, descriptor);
    if (isActive && this.session) {
      await this.session.clearPersistence();
      return;
    }
    const temporaryDoc = new (await import("yjs")).Doc();
    const persistence = await this.dependencies.createPersistence(descriptor, temporaryDoc);
    await persistence.whenSynced;
    await persistence.clearData();
    await persistence.destroy();
    temporaryDoc.destroy();
  }
}

export const createCollaborationRuntime = () => new CollaborationRuntime();
