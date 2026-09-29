import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { normalizeBlackboardPath, parseBlackboardManifest, renameBlackboardManifest } from "@chardesk/blackboard";
import { createEntityId } from "@/shared/utils/id";
import {
  BlackboardRevisionConflictError,
  createBlackboardStarterFiles,
  normalizeWorkspaceOperations,
  type BlackboardFile,
  type BlackboardWorkspace,
  type BlackboardWorkspaceOperation,
  type BlackboardWorkspaceRepository,
  type BlackboardWorkspaceSnapshot,
} from "./repository";

export const BLACKBOARD_DATABASE = "chardesk-blackboard-workspaces";
export const BLACKBOARD_DATABASE_VERSION = 1;

type StoredFile = BlackboardFile & { workspaceId: string };

interface BlackboardDatabase extends DBSchema {
  workspaces: {
    key: string;
    value: BlackboardWorkspace;
  };
  files: {
    key: [string, string];
    value: StoredFile;
    indexes: { "by-workspace": string };
  };
}

type BlackboardRepositoryOptions = {
  databaseName?: string;
  now?: () => number;
};

export class IndexedDbBlackboardRepository implements BlackboardWorkspaceRepository {
  readonly #databaseName: string;
  readonly #now: () => number;
  readonly #listeners = new Set<(workspaceId: string) => void>();
  #database: Promise<IDBPDatabase<BlackboardDatabase>> | null = null;

  constructor({
    databaseName = BLACKBOARD_DATABASE,
    now = Date.now,
  }: BlackboardRepositoryOptions = {}) {
    this.#databaseName = databaseName;
    this.#now = now;
  }

  #open() {
    this.#database ??= openDB<BlackboardDatabase>(
      this.#databaseName,
      BLACKBOARD_DATABASE_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains("workspaces")) {
            database.createObjectStore("workspaces", { keyPath: "id" });
          }
          if (!database.objectStoreNames.contains("files")) {
            const files = database.createObjectStore("files", {
              keyPath: ["workspaceId", "path"],
            });
            files.createIndex("by-workspace", "workspaceId");
          }
        },
      },
    );
    return this.#database;
  }

  subscribe(listener: (workspaceId: string) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(workspaceId: string) {
    this.#listeners.forEach((listener) => listener(workspaceId));
  }

  async close() {
    const database = await this.#database;
    database?.close();
    this.#database = null;
  }

  async listWorkspaces() {
    const database = await this.#open();
    return (await database.getAll("workspaces"))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async createWorkspace(input: { id?: string; title?: string } = {}) {
    const database = await this.#open();
    const id = input.id?.trim() || createEntityId("blackboard");
    const existing = await database.get("workspaces", id);
    if (existing) throw new Error(`Blackboard workspace already exists: ${id}`);
    const timestamp = this.#now();
    const workspace: BlackboardWorkspace = {
      id,
      title: input.title?.trim() || "Blackboard",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const files = createBlackboardStarterFiles().map((file) => file.path === "blackboard.yaml"
      ? { ...file, content: renameBlackboardManifest(file.content, workspace.title) }
      : file);
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    await transaction.objectStore("workspaces").put(workspace);
    await Promise.all(files.map((file) => transaction.objectStore("files").put({
      workspaceId: id,
      ...file,
    })));
    await transaction.done;
    this.#emit(id);
    return { workspace, files };
  }

  async importWorkspace(title: string, files: readonly BlackboardFile[]) {
    const normalized = validateFiles(files);
    const database = await this.#open();
    const id = createEntityId("blackboard");
    const timestamp = this.#now();
    const workspace: BlackboardWorkspace = { id, title, revision: 1, createdAt: timestamp, updatedAt: timestamp };
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    await transaction.objectStore("workspaces").add(workspace);
    for (const file of normalized) await transaction.objectStore("files").add({ workspaceId: id, ...file });
    await transaction.done;
    this.#emit(id);
    return { workspace, files: normalized };
  }

  async replaceWorkspace(id: string, files: readonly BlackboardFile[], baseRevision: number) {
    const normalized = validateFiles(files);
    const database = await this.#open();
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    const workspaces = transaction.objectStore("workspaces");
    const fileStore = transaction.objectStore("files");
    const current = await workspaces.get(id);
    if (!current) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new Error(`Blackboard workspace not found: ${id}`);
    }
    if (current.revision !== baseRevision) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new BlackboardRevisionConflictError(current.revision);
    }
    let cursor = await fileStore.index("by-workspace").openKeyCursor(id);
    while (cursor) {
      await fileStore.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    for (const file of normalized) await fileStore.add({ workspaceId: id, ...file });
    let title = current.title;
    try { title = parseBlackboardManifest(normalized.find((file) => file.path === "blackboard.yaml")!.content).manifest.title ?? title; }
    catch { /* Preserve last valid title while source is repaired. */ }
    const workspace = { ...current, title, revision: current.revision + 1, updatedAt: this.#now() };
    await workspaces.put(workspace);
    await transaction.done;
    this.#emit(id);
    return { workspace, files: normalized };
  }

  async renameWorkspace(id: string, title: string): Promise<BlackboardWorkspaceSnapshot> {
    const name = title.trim();
    if (!name) throw new Error("Blackboard title must not be empty.");
    const database = await this.#open();
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    const workspaces = transaction.objectStore("workspaces");
    const files = transaction.objectStore("files");
    const current = await workspaces.get(id);
    const manifest = await files.get([id, "blackboard.yaml"]);
    if (!current || !manifest) {
      transaction.abort();
      throw new Error(`Blackboard workspace not found: ${id}`);
    }
    const content = renameBlackboardManifest(manifest.content, name);
    const workspace = {
      ...current,
      title: name,
      revision: current.revision + 1,
      updatedAt: this.#now(),
    };
    await files.put({ ...manifest, content });
    await workspaces.put(workspace);
    await transaction.done;
    this.#emit(id);
    return (await this.readWorkspace(id))!;
  }

  async deleteWorkspace(id: string) {
    const database = await this.#open();
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    await transaction.objectStore("workspaces").delete(id);
    let cursor = await transaction.objectStore("files").index("by-workspace").openKeyCursor(id);
    while (cursor) {
      await transaction.objectStore("files").delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await transaction.done;
    this.#emit(id);
  }

  async readWorkspace(id: string): Promise<BlackboardWorkspaceSnapshot | null> {
    const database = await this.#open();
    const transaction = database.transaction(["workspaces", "files"]);
    const workspace = await transaction.objectStore("workspaces").get(id);
    if (!workspace) return null;
    const stored = await transaction.objectStore("files").index("by-workspace").getAll(id);
    await transaction.done;
    return {
      workspace,
      files: stored
        .map(({ path, content }) => ({ path, content }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    };
  }

  async apply(
    id: string,
    operations: readonly BlackboardWorkspaceOperation[],
    baseRevision?: number,
  ) {
    const normalized = normalizeWorkspaceOperations(operations);
    const database = await this.#open();
    const transaction = database.transaction(["workspaces", "files"], "readwrite");
    const workspaces = transaction.objectStore("workspaces");
    const files = transaction.objectStore("files");
    const current = await workspaces.get(id);
    if (!current) throw new Error(`Blackboard workspace not found: ${id}`);
    if (baseRevision !== undefined && baseRevision !== current.revision) {
      await transaction.done;
      throw new BlackboardRevisionConflictError(current.revision);
    }
    let title = current.title;
    for (const operation of normalized) {
      if (operation.op === "write") {
        await files.put({ workspaceId: id, path: operation.path, content: operation.content });
        if (operation.path === "blackboard.yaml") {
          try {
            title = parseBlackboardManifest(operation.content).manifest.title ?? title;
          } catch { /* Invalid source is stored for repair; retain the last valid title. */ }
        }
      } else {
        await files.delete([id, operation.path]);
      }
    }
    const workspace = {
      ...current,
      title,
      revision: current.revision + 1,
      updatedAt: this.#now(),
    };
    await workspaces.put(workspace);
    await transaction.done;
    this.#emit(id);
    return (await this.readWorkspace(id))!;
  }
}

const validateFiles = (files: readonly BlackboardFile[]): BlackboardFile[] => {
  const paths = new Set<string>();
  const normalized = files.map(({ path, content }) => {
    const key = normalizeBlackboardPath(path);
    if (paths.has(key) || typeof content !== "string") throw new Error("Invalid Blackboard source tree");
    paths.add(key);
    return { path: key, content };
  });
  if (!paths.has("blackboard.yaml")) throw new Error("Blackboard source tree requires blackboard.yaml");
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
};
