import { openDB, type DBSchema } from "idb";

export type BlackboardFile = Readonly<{ path: string; content: string }>;
export type BlackboardWorkspace = Readonly<{ id: string; title: string; revision: number; createdAt: number; updatedAt: number }>;
export type BlackboardWorkspaceSnapshot = Readonly<{ workspace: BlackboardWorkspace; files: readonly BlackboardFile[] }>;
export type MigrationRecord = { workspaceId: string; sessionId: string; state: "pending" | "complete" };
interface LegacyDatabase extends DBSchema {
  workspaces: { key: string; value: BlackboardWorkspace };
  files: { key: [string, string]; value: BlackboardFile & { workspaceId: string }; indexes: { "by-workspace": string } };
  migrations: { key: string; value: MigrationRecord };
}

/** Old source stores are read-only; only the migration journal can be changed. */
export class LegacyBlackboardRepository {
  readonly databaseName: string;
  constructor(databaseName = "chardesk-blackboard-workspaces") { this.databaseName = databaseName; }
  #database = () => openDB<LegacyDatabase>(this.databaseName, 2, { upgrade(database) {
    if (!database.objectStoreNames.contains("workspaces")) database.createObjectStore("workspaces", { keyPath: "id" });
    if (!database.objectStoreNames.contains("files")) {
      database.createObjectStore("files", { keyPath: ["workspaceId", "path"] }).createIndex("by-workspace", "workspaceId");
    }
    if (!database.objectStoreNames.contains("migrations")) database.createObjectStore("migrations", { keyPath: "workspaceId" });
  } });
  async listWorkspaces(includeArchived = false) {
    const database = await this.#database();
    try {
      const done = new Set((await database.getAll("migrations")).filter((item) => item.state === "complete").map((item) => item.workspaceId));
      return (await database.getAll("workspaces")).filter((item) => includeArchived || !done.has(item.id));
    } finally { database.close(); }
  }
  async readWorkspace(id: string): Promise<BlackboardWorkspaceSnapshot | null> {
    const database = await this.#database();
    try {
      const workspace = await database.get("workspaces", id);
      if (!workspace) return null;
      const files = await database.getAllFromIndex("files", "by-workspace", id);
      return { workspace, files: files.map(({ path, content }) => ({ path, content })) };
    } finally { database.close(); }
  }
  async readMigration(id: string) {
    const database = await this.#database();
    try { return await database.get("migrations", id); } finally { database.close(); }
  }
  async listMigrations() {
    const database = await this.#database();
    try { return await database.getAll("migrations"); } finally { database.close(); }
  }
  async saveMigration(record: MigrationRecord) {
    const database = await this.#database();
    try { await database.put("migrations", record); } finally { database.close(); }
  }
}

export const legacyBlackboards = new LegacyBlackboardRepository();
