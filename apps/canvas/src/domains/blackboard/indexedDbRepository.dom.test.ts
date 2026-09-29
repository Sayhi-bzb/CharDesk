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
    expect(created.files.find(({ path }) => path === "blackboard.yaml")?.content)
      .toContain("title: Board");

    const changed = await repository.apply("board", [
      { op: "write", path: "panels/new.panel", content: "New" },
      { op: "delete", path: "panels/welcome.panel" },
    ], created.workspace.revision);
    expect(changed.workspace.revision).toBe(2);
    expect(changed.files).toContainEqual({ path: "panels/new.panel", content: "New" });
  });

  it("renames workspace metadata and its source title in one revision", async () => {
    const repository = createRepository();
    await repository.createWorkspace({ id: "board", title: "Board" });
    const renamed = await repository.renameWorkspace("board", "  New Board  ");
    expect(renamed.workspace).toMatchObject({ title: "New Board", revision: 2 });
    expect(renamed.files.find(({ path }) => path === "blackboard.yaml")?.content)
      .toContain("title: New Board");
    expect((await repository.listWorkspaces())[0]?.title).toBe("New Board");
    const source = renamed.files.find(({ path }) => path === "blackboard.yaml")!.content;
    const authored = await repository.apply("board", [{
      op: "write", path: "blackboard.yaml", content: source.replace("New Board", "Authored title"),
    }]);
    expect(authored.workspace.title).toBe("Authored title");
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

  it("imports and replaces a complete source tree atomically without starter files", async () => {
    const repository = createRepository();
    const files = [
      { path: "blackboard.yaml", content: "invalid draft source" },
      { path: "panels/draft.panel", content: "Draft" },
    ];
    const imported = await repository.importWorkspace("Cloud draft", files);
    expect(imported.workspace.title).toBe("Cloud draft");
    expect(imported.files).toEqual(files);
    await expect(repository.replaceWorkspace(imported.workspace.id, [
      { path: "../outside", content: "bad" },
    ], 1)).rejects.toThrow();
    expect((await repository.readWorkspace(imported.workspace.id))?.files).toEqual(files);
    await expect(repository.replaceWorkspace(imported.workspace.id, [
      { path: "blackboard.yaml", content: "changed" },
    ], 0)).rejects.toBeInstanceOf(BlackboardRevisionConflictError);
    const replaced = await repository.replaceWorkspace(imported.workspace.id, [
      { path: "blackboard.yaml", content: "new draft" },
    ], 1);
    expect(replaced.files).toEqual([{ path: "blackboard.yaml", content: "new draft" }]);
    expect(replaced.workspace.revision).toBe(2);
  });
});
