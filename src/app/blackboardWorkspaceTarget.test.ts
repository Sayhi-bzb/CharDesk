// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { IndexedDbBlackboardRepository } from "@/domains/blackboard/public";
import { createApplicationEditorHost } from "./compositionRoot";
import { createBlackboardWorkspaceTarget } from "./blackboardWorkspaceTarget";

describe("Blackboard workspace target", () => {
  const disposals: Array<() => Promise<void>> = [];

  afterEach(async () => {
    window.history.replaceState(null, "", "/");
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
  });

  it("activates a browser workspace without exposing a Canvas session ID", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-target-${crypto.randomUUID()}`,
    });
    const host = createApplicationEditorHost({ blackboardRepository: repository });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    await repository.createWorkspace({ id: "gpu", title: "GPU" });
    window.history.replaceState(null, "", "/?webmcp=polyfill");
    const target = createBlackboardWorkspaceTarget({
      blackboard: host.blackboard,
      canvas: host.canvas,
      location: window.location,
      history: window.history,
    });

    expect(target.getActiveWorkspaceId()).toBeNull();
    await target.activateWorkspace("gpu");

    expect(target.getActiveWorkspaceId()).toBe("gpu");
    expect(window.location.pathname).toBe("/blackboard");
    expect(window.location.search).toBe("?webmcp=polyfill&workspace=gpu");
    expect(host.canvas.getState().canvasSessions.find(
      (session) => session.sourceBinding?.provider === "browser-workspace" &&
        session.sourceBinding.id === "gpu",
    )).toBeDefined();

    window.history.replaceState(null, "", "/legacy/?webmcp=polyfill");
    await target.activateWorkspace("gpu");
    expect(window.location.pathname).toBe("/legacy/blackboard");
  });

  it("switches to an existing Canvas session instead of duplicating it", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-target-switch-${crypto.randomUUID()}`,
    });
    const host = createApplicationEditorHost({ blackboardRepository: repository });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    await repository.createWorkspace({ id: "first", title: "First" });
    await repository.createWorkspace({ id: "second", title: "Second" });
    const target = createBlackboardWorkspaceTarget({
      blackboard: host.blackboard,
      canvas: host.canvas,
      location: window.location,
      history: window.history,
    });

    await target.activateWorkspace("first");
    await target.activateWorkspace("second");
    await target.activateWorkspace("first");

    expect(target.getActiveWorkspaceId()).toBe("first");
    expect(host.canvas.getState().canvasSessions.filter(
      (session) => session.sourceBinding?.provider === "browser-workspace",
    )).toHaveLength(2);
  });

  it("closes a source view without deleting its workspace", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-target-close-${crypto.randomUUID()}`,
    });
    const host = createApplicationEditorHost({ blackboardRepository: repository });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    await repository.createWorkspace({ id: "kept", title: "Kept" });
    const target = createBlackboardWorkspaceTarget({
      blackboard: host.blackboard,
      canvas: host.canvas,
      location: window.location,
      history: window.history,
    });

    await target.activateWorkspace("kept");
    const sourceSession = host.canvas.getState().canvasSessions.find(
      (session) => session.sourceBinding?.id === "kept",
    );
    expect(sourceSession).toBeDefined();
    await host.canvas.commands.sessions.remove(sourceSession!.id);

    await expect(repository.readWorkspace("kept")).resolves.not.toBeNull();
  });
});
