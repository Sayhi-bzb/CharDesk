import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { importOriginSnapshot } from "./originMigration";

const marker = "chardesk-origin-migration-v1";
const names: string[] = [];
const request = <T>(operation: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error);
});

const makeSnapshot = (name: string) => ({
  type: "chardesk-migration-snapshot" as const,
  token: "test",
  databases: [{
    name,
    version: 1,
    stores: [{
      name: "updates",
      keyPath: null,
      autoIncrement: true,
      indexes: [],
      records: [{ key: 1, value: new Uint8Array([1, 2, 3]) }],
    }],
  }],
  storage: [
    ["chardesk-canvas-font-v1", "test-font"],
    ["chardesk-canvas-writer-lease-v1", "stale-lease"],
  ] as [string, string][],
});

afterEach(async () => {
  localStorage.clear();
  await Promise.all(names.splice(0).map((name) => request(indexedDB.deleteDatabase(name))));
});

describe("old-origin workspace transfer", () => {
  it("restores a document and stable settings without copying writer leases", async () => {
    const name = `chardesk-local-document-v1:test-${crypto.randomUUID()}`;
    names.push(name);
    await importOriginSnapshot(makeSnapshot(name));

    const database = await request(indexedDB.open(name));
    const stored = await request(database.transaction("updates").objectStore("updates").get(1));
    database.close();
    expect(Array.from(stored as Uint8Array)).toEqual([1, 2, 3]);
    expect(localStorage.getItem("chardesk-canvas-font-v1")).toBe("test-font");
    expect(localStorage.getItem("chardesk-canvas-writer-lease-v1")).toBeNull();
    expect(localStorage.getItem(marker)).toBe("complete");
  });

  it("refuses to overwrite a workspace already present on the new origin", async () => {
    const name = `chardesk-local-document-v1:test-${crypto.randomUUID()}`;
    names.push(name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open(name, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("existing");
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    database.close();

    await expect(importOriginSnapshot(makeSnapshot(name))).rejects.toThrow("will not overwrite");
    expect(localStorage.getItem(marker)).toBeNull();
    const unchanged = await request(indexedDB.open(name));
    expect(Array.from(unchanged.objectStoreNames)).toEqual(["existing"]);
    unchanged.close();
  });
});
