import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore, MAX_ACCOUNT_BACKUP_BYTES } from "./account-store.js";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach((close) => close()); });
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "chardesk-retirement-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "account.db");
  const store = new AccountStore(path);
  cleanup.push(() => store.close());
  store.upsertUser({ id: "owner", login: "owner", avatarUrl: null });
  store.upsertUser({ id: "other", login: "other", avatarUrl: null });
  const work = store.createBackup("owner", "blackboard", "Saved", "original source");
  return { path, store, work };
};

describe("cloud retirement transaction", () => {
  it("preserves later native edits on repeat migration and isolates archives", () => {
    const { store, work } = fixture();
    expect(store.migrateBlackboard("owner", work.id, 2, "canvas", "native")).toEqual({ status: "conflict" });
    expect(store.migrateBlackboard("other", work.id, 1, "canvas", "stolen")).toEqual({ status: "not-found" });
    expect(store.migrateBlackboard("owner", work.id, 1, "canvas", "native")).toMatchObject({ status: "migrated" });
    expect(store.updateBackup("owner", work.id, 2, "Edited", "native edit")).toMatchObject({ status: "updated" });
    expect(store.migrateBlackboard("owner", work.id, 1, "slides", "replacement")).toMatchObject({
      status: "migrated", work: { kind: "canvas", revision: 3 },
    });
    expect(store.readBackup("owner", work.id)?.content).toBe("native edit");
    expect(store.readRetiredSource("other", work.id)).toBeUndefined();
    expect(store.readRetiredSource("owner", work.id)?.content).toBe("original source");
  });

  it("includes retained source in quota and leaves everything unchanged on rejection", () => {
    const { store, work, path } = fixture();
    const database = new DatabaseSync(path);
    cleanup.push(() => database.close());
    database.prepare("UPDATE work_content SET bytes = ? WHERE work_id = ?")
      .run(MAX_ACCOUNT_BACKUP_BYTES - 1, work.id);
    expect(() => store.migrateBlackboard("owner", work.id, 1, "canvas", "native")).toThrow();
    expect(store.readBackup("owner", work.id)).toMatchObject({ content: "original source", revision: 1 });
    expect(store.listWorks("owner")[0].kind).toBe("blackboard");
    expect(store.readRetiredSource("owner", work.id)).toBeUndefined();
  });

  it("rolls back an archive if a later database write fails", () => {
    const { store, work, path } = fixture();
    const database = new DatabaseSync(path);
    cleanup.push(() => database.close());
    database.exec("CREATE TRIGGER reject_conversion BEFORE UPDATE OF kind ON works BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => store.migrateBlackboard("owner", work.id, 1, "canvas", "native")).toThrow("test failure");
    expect(store.readRetiredSource("owner", work.id)).toBeUndefined();
    expect(store.listWorks("owner")[0].kind).toBe("blackboard");
    expect(store.readBackup("owner", work.id)).toMatchObject({ content: "original source", revision: 1 });
  });
});
