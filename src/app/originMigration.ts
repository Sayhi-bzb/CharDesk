import { showStartupMigrationFailure, showStartupPhase } from "./startupDom";

type MigratedIndex = {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
};

type MigratedStore = {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: MigratedIndex[];
  records: { key: IDBValidKey; value: unknown }[];
};

type MigratedDatabase = {
  name: string;
  version: number;
  stores: MigratedStore[];
};

type Snapshot = {
  type: "chardesk-migration-snapshot";
  token: string;
  databases: MigratedDatabase[];
  storage: [string, string][];
};

const OLD_ORIGIN = "https://chardesk.com";
const NEW_ORIGIN = "https://canvas.chardesk.com";
const MIGRATION_MARKER = "chardesk-origin-migration-v1";
const allowedDatabase = (name: string) => name === "chardesk-canvas-catalog"
  || name === "chardesk-blackboard-workspaces"
  || name.startsWith("chardesk-local-document-v1:")
  || /^chardesk-room-v\d+:/u.test(name);
const allowedKey = (key: string) => (key.startsWith("chardesk-")
  || key.startsWith("ascii-canvas-"))
  && !key.includes("lease")
  && key !== MIGRATION_MARKER;

const request = <T>(operation: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error);
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});

const isSnapshot = (value: unknown): value is Snapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Snapshot>;
  return candidate.type === "chardesk-migration-snapshot"
    && Array.isArray(candidate.databases)
    && Array.isArray(candidate.storage);
};

const readOldOrigin = () => new Promise<Snapshot>((resolve, reject) => {
  const token = crypto.randomUUID();
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Old CharDesk workspace transfer";
  const finish = (error?: Error, value?: Snapshot) => {
    window.clearTimeout(timeout);
    window.removeEventListener("message", onMessage);
    frame.remove();
    if (error) reject(error);
    else resolve(value!);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== OLD_ORIGIN || event.source !== frame.contentWindow) return;
    if (event.data?.token !== token) return;
    if (event.data.type === "chardesk-migration-error") {
      finish(new Error(String(event.data.message)));
    } else if (isSnapshot(event.data)) {
      finish(undefined, event.data);
    }
  };
  const timeout = window.setTimeout(() => finish(new Error("Old workspace did not respond")), 10_000);
  window.addEventListener("message", onMessage);
  frame.onload = () => frame.contentWindow?.postMessage(
    { type: "chardesk-migration-request", token }, OLD_ORIGIN,
  );
  frame.onerror = () => finish(new Error("Old workspace is unavailable"));
  frame.src = `${OLD_ORIGIN}/migration/bridge.html`;
  document.body.append(frame);
});

const readOldOriginViaTab = () => new Promise<Snapshot>((resolve, reject) => {
  const token = crypto.randomUUID();
  const popup = window.open(`${OLD_ORIGIN}/migration/bridge.html`, "chardesk-workspace-transfer");
  if (!popup) { reject(new Error("Your browser blocked the transfer tab")); return; }
  const finish = (error?: Error, value?: Snapshot) => {
    window.clearTimeout(timeout);
    window.removeEventListener("message", onMessage);
    popup.close();
    if (error) reject(error);
    else resolve(value!);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== OLD_ORIGIN || event.source !== popup) return;
    if (event.data?.type === "chardesk-migration-ready") {
      popup.postMessage({ type: "chardesk-migration-request", token }, OLD_ORIGIN);
    } else if (event.data?.token === token && event.data.type === "chardesk-migration-error") {
      finish(new Error(String(event.data.message)));
    } else if (event.data?.token === token && isSnapshot(event.data)) {
      finish(undefined, event.data);
    }
  };
  const timeout = window.setTimeout(() => finish(new Error("Transfer tab did not respond")), 60_000);
  window.addEventListener("message", onMessage);
});

const restoreDatabase = async ({ name, version, stores }: MigratedDatabase) => {
  if (!allowedDatabase(name) || !Number.isInteger(version) || version < 1) {
    throw new Error("Invalid old workspace database");
  }
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(name, version);
    opening.onerror = () => reject(opening.error);
    opening.onupgradeneeded = () => {
      const result = opening.result;
      for (const store of stores) {
        const created = result.createObjectStore(store.name, {
          ...(store.keyPath === null ? {} : { keyPath: store.keyPath }),
          autoIncrement: store.autoIncrement,
        });
        for (const index of store.indexes) {
          created.createIndex(index.name, index.keyPath, {
            unique: index.unique,
            multiEntry: index.multiEntry,
          });
        }
      }
    };
    opening.onsuccess = () => resolve(opening.result);
  });
  try {
    for (const store of stores) {
      const transaction = database.transaction(store.name, "readwrite");
      const target = transaction.objectStore(store.name);
      const done = transactionDone(transaction);
      for (const record of store.records) {
        if (store.keyPath === null) target.put(record.value, record.key);
        else target.put(record.value);
      }
      await done;
      const count = await request(database.transaction(store.name).objectStore(store.name).count());
      if (count !== store.records.length) throw new Error(`Incomplete workspace copy: ${name}`);
    }
  } catch (error) {
    database.close();
    await request(indexedDB.deleteDatabase(name));
    throw error;
  } finally {
    database.close();
  }
};

export const importOriginSnapshot = async (snapshot: Snapshot) => {
  if (typeof indexedDB.databases !== "function") throw new Error("Database discovery is unavailable in this browser");
  const existing = new Set((await indexedDB.databases()).map(({ name }) => name));
  const databases = snapshot.databases;
  if (databases.some(({ name }) => existing.has(name))) {
    throw new Error("This Canvas already contains local work; automatic transfer will not overwrite it");
  }
  const created: string[] = [];
  try {
    for (const database of databases) {
      await restoreDatabase(database);
      created.push(database.name);
    }
    for (const [key, value] of snapshot.storage) {
      if (allowedKey(key) && key !== MIGRATION_MARKER && localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    for (const name of created) await request(indexedDB.deleteDatabase(name));
    throw error;
  }
  localStorage.setItem(MIGRATION_MARKER, "complete");
};

export const prepareOriginMigration = async () => {
  if (window.location.origin !== NEW_ORIGIN) return;
  try {
    if (localStorage.getItem(MIGRATION_MARKER) === "complete") return;
    showStartupPhase("transferring");
    await importOriginSnapshot(await readOldOrigin());
  } catch (error) {
    await new Promise<void>((resolve) => {
      showStartupMigrationFailure(error, {
        recoverHref: `${OLD_ORIGIN}/legacy/`,
        retry: () => window.location.reload(),
        transferInTab: async () => {
          await importOriginSnapshot(await readOldOriginViaTab());
          resolve();
        },
        continue: resolve,
      });
    });
  }
};
