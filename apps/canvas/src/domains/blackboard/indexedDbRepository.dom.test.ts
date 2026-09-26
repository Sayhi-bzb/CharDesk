import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { IndexedDbBlackboardRepository } from "./indexedDbRepository";
import { BlackboardRevisionConflictError } from "./repository";

const repositories: Array<{ name: string; repository: IndexedDbBlackboardRepository }> = [];
const createRepository = () => {
  const databaseName = `blackboard-test-${crypto.randomUUID()}`;
  const repository = new IndexedDbBlackboardRepository({ databaseName, now: () => 42 });
  repositories.push({ name: databaseName, repository });
  return repository;
};

afterEach(async () => Promise.all(repositories.splice(0).map(async ({ name, repository }) => {
  await repository.close();
  await deleteDB(name);
})));

describe("IndexedDbBlackboardRepository", () => {
  it("persists a virtual source tree and applies file operations", async () => {
    const repository = createRepository();
    const created = await repository.createWorkspace({ id: "board", title: "Board" });
    expect(created.files.map(({ path }) => path)).toContain("blackboard.yaml");

    const changed = await repository.apply("board", [
      { op: "write", path: "panels/new.panel", content: "New" },
      { op: "delete", path: "panels/welcome.panel" },
    ], created.workspace.revision);
    expect(changed.workspace.revision).toBe(2);
    expect(changed.files).toContainEqual({ path: "panels/new.panel", content: "New" });
  });

  it("rejects stale writes and paths outside the workspace", async () => {
    const repository = createRepository();
    await repository.createWorkspace({ id: "board" });
    await expect(repository.apply("board", [
      { op: "write", path: "panel.panel", content: "ok" },
    ], 0)).rejects.toBeInstanceOf(BlackboardRevisionConflictError);
    await expect(repository.apply("board", [
      { op: "write", path: "../secret", content: "no" },
    ])).rejects.toThrow("package-relative");
  });
});
