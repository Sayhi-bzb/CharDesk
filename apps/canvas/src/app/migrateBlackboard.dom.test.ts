import "fake-indexeddb/auto";
import { openDB, deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasRuntime, type CanvasRuntime } from "@/domains/canvas/public";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { parseDocumentSessionSource } from "@/domains/document/public";
import { LegacyBlackboardRepository } from "@/domains/legacy-blackboard/public";
import { migrateBlackboard } from "./migrateBlackboard";

const runtimes: CanvasRuntime[] = [];
const databaseName = "legacy-retirement-test";
const workspaceId = "legacy-test-work";
beforeEach(() => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: (name: string, optionsOrTask: LockOptions | ((lock: Lock) => unknown), callback?: (lock: Lock) => unknown) => {
      const task = typeof optionsOrTask === "function" ? optionsOrTask : callback!;
      return Promise.resolve(task({ name, mode: "exclusive" }));
    },
  } });
});
const create = () => {
  const runtime = createCanvasRuntime({
    persistence: { storage: localStorage, key: "retirement-test" },
    parseSessionSource: parseDocumentSessionSource,
    selectionCommands: createSelectionCommandFactory({
      renderClipboardText: async () => ({ kind: "plain", text: "", renderer: "raw", pipeline: [], diagnostics: [] }),
    }),
    initialSessions: [{ id: "old-view", name: "Legacy", mode: "freeform", grid: [],
      sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: workspaceId } }],
  });
  runtimes.push(runtime);
  return runtime;
};
const seed = async (manifest = "chardesk: blackboard/v1\npanels:\n  main: { source: main.panel }\nlayout:\n  areas: [[main]]") => {
  const db = await openDB(databaseName, 1, { upgrade(database) {
    database.createObjectStore("workspaces", { keyPath: "id" });
    database.createObjectStore("files", { keyPath: ["workspaceId", "path"] }).createIndex("by-workspace", "workspaceId");
  } });
  await db.put("workspaces", { id: workspaceId, title: "Legacy", revision: 1, createdAt: 1, updatedAt: 1 });
  await db.put("files", { workspaceId, path: "blackboard.yaml", content: manifest });
  await db.put("files", { workspaceId, path: "main.panel", content: "Legacy content" });
  db.close();
  return new LegacyBlackboardRepository(databaseName);
};
afterEach(async () => {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
  vi.restoreAllMocks();
  localStorage.clear();
  for (const { name } of await indexedDB.databases()) {
    if (name) await deleteDB(name);
  }
});

describe("retired Blackboard migration", () => {
  it("converts a bound shell once, persists content, and never overwrites native edits", async () => {
    const repository = await seed();
    const canvas = create();
    const [id, same] = await Promise.all([
      migrateBlackboard(canvas, workspaceId, repository),
      migrateBlackboard(canvas, workspaceId, repository),
    ]);
    expect(id).toBe(same);
    expect(id).toBe("old-view");
    expect(canvas.getState().canvasSessions).toHaveLength(1);
    expect(canvas.getState().canvasSessions[0].sourceBinding).toBeUndefined();
    expect(canvas.getState().canvasSessions[0].migrationPending).toBeUndefined();
    expect((await canvas.materializeSession(id))?.surface.getCell({ x: 0, y: 0 })?.char).toBe("L");
    canvas.commands.text.writeAt("Changed", { x: 0, y: 0 });
    await canvas.flushPersistence(id);
    await migrateBlackboard(canvas, workspaceId, repository);
    expect((await canvas.materializeSession(id))?.surface.getCell({ x: 0, y: 0 })?.char).toBe("C");
    expect((await repository.readWorkspace(workspaceId))?.files.find((file) => file.path === "main.panel")?.content).toBe("Legacy content");
    expect(await repository.listWorkspaces()).toEqual([]);
    canvas.dispose();
    const restored = create();
    await restored.ready;
    expect((await restored.materializeSession(id))?.surface.getCell({ x: 0, y: 0 })?.char).toBe("C");
  });

  it("keeps source and a pending journal when persistence fails, then retries the same target", async () => {
    const repository = await seed();
    const canvas = create();
    const flush = vi.spyOn(canvas, "flushPersistence").mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(migrateBlackboard(canvas, workspaceId, repository)).rejects.toThrow("Storage unavailable");
    expect(await repository.readMigration(workspaceId)).toMatchObject({ state: "pending", sessionId: "old-view" });
    expect(canvas.getState().canvasSessions[0].migrationPending).toBe(true);
    expect(() => canvas.commands.text.writeAt("No", { x: 0, y: 0 })).toThrow();
    flush.mockRestore();
    await migrateBlackboard(canvas, workspaceId, repository);
    expect(canvas.getState().canvasSessions).toHaveLength(1);
    expect(await repository.readMigration(workspaceId)).toMatchObject({ state: "complete" });
    expect(await repository.readWorkspace(workspaceId)).not.toBeNull();
  });

  it("keeps invalid source available without publishing a native document", async () => {
    const repository = await seed("invalid manifest");
    const canvas = create();
    await expect(migrateBlackboard(canvas, workspaceId, repository)).rejects.toThrow();
    expect(canvas.getState().canvasSessions[0].sourceBinding).toBeDefined();
    expect(await repository.readWorkspace(workspaceId)).not.toBeNull();
  });
});
