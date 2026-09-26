// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  BlackboardRuntime,
  IndexedDbBlackboardRepository,
} from "@/domains/blackboard/public";
import {
  BLACKBOARD_AGENT_TOOL_NAMES,
  createBlackboardAgentTools,
} from "./blackboardTools";

describe("Blackboard agent tools", () => {
  const disposals: Array<() => Promise<void>> = [];
  afterEach(async () => Promise.all(disposals.splice(0).map((dispose) => dispose())));

  const createTools = (databaseName: string) => {
    const repository = new IndexedDbBlackboardRepository({ databaseName });
    disposals.push(async () => repository.close());
    let activeWorkspaceId: string | null = null;
    const workspaceTarget = {
      getActiveWorkspaceId: () => activeWorkspaceId,
      activateWorkspace: async (workspaceId: string) => {
        if (!await repository.readWorkspace(workspaceId)) {
          throw new Error(`Blackboard workspace not found: ${workspaceId}`);
        }
        activeWorkspaceId = workspaceId;
      },
    };
    const tools = createBlackboardAgentTools({
      blackboard: new BlackboardRuntime(repository),
      workspaceTarget,
    });
    return {
      repository,
      workspaceTarget,
      tools,
      byName: new Map(tools.map((tool) => [tool.name, tool])),
    };
  };

  it("uses one namespaced public contract with human-readable titles", () => {
    const { tools } = createTools(`agent-tools-contract-${crypto.randomUUID()}`);

    expect(tools.map(({ name }) => name)).toEqual(Object.values(BLACKBOARD_AGENT_TOOL_NAMES));
    expect(tools.every(({ title }) => Boolean(title))).toBe(true);
    expect(tools.some(({ name }) => name === "apply_patch")).toBe(false);
    expect(tools.filter(({ name }) => name !== BLACKBOARD_AGENT_TOOL_NAMES.listWorkspaces)
      .every(({ description }) => description.includes("blackboard.yaml") ||
        description.includes("workspace"))).toBe(true);
  });

  it("returns a structured result when no workspace is active", async () => {
    const { byName } = createTools(`agent-tools-target-${crypto.randomUUID()}`);

    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listFiles)!.execute({}))
      .resolves.toEqual({
        ok: false,
        code: "workspace_not_active",
        message: "Create or open a Blackboard workspace first.",
      });
    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listFiles)!.execute({
      workspaceId: 42,
    })).rejects.toThrow("workspaceId must be a string");
  });

  it("uses the active workspace when workspaceId is omitted", async () => {
    const { repository, workspaceTarget, byName } = createTools(
      `agent-tools-active-${crypto.randomUUID()}`,
    );
    await repository.createWorkspace({ id: "first", title: "First" });
    await repository.createWorkspace({ id: "second", title: "Second" });
    await workspaceTarget.activateWorkspace("second");

    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listFiles)!.execute({}))
      .resolves.toMatchObject({ workspaceId: "second" });
    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.readFile)!.execute({
      path: "panels/welcome.panel",
    })).resolves.toMatchObject({ workspaceId: "second" });
  });

  it("isolates explicitly selected workspaces", async () => {
    const { repository, byName } = createTools(`agent-tools-${crypto.randomUUID()}`);
    await repository.createWorkspace({ id: "first", title: "First" });
    await repository.createWorkspace({ id: "second", title: "Second" });
    const write = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.writeFile)!;
    const read = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.readFile)!;

    await write.execute({
      workspaceId: "first",
      path: "panels/active.panel",
      content: "First content",
    });
    await write.execute({
      workspaceId: "second",
      path: "panels/active.panel",
      content: "Second content",
    });

    await expect(read.execute({ workspaceId: "first", path: "panels/active.panel" }))
      .resolves.toMatchObject({ workspaceId: "first", content: "First content" });
    await expect(read.execute({ workspaceId: "second", path: "panels/active.panel" }))
      .resolves.toMatchObject({ workspaceId: "second", content: "Second content" });
  });

  it("creates, lists, edits, and checks a workspace without an active canvas", async () => {
    const { byName } = createTools(`agent-tools-origin-${crypto.randomUUID()}`);

    const created = await byName.get(BLACKBOARD_AGENT_TOOL_NAMES.createWorkspace)!
      .execute({ title: "Agent board" });
    expect(created).toMatchObject({
      title: "Agent board",
      revision: 1,
      url: expect.stringMatching(/^\/blackboard\?workspace=/),
      active: true,
    });
    const workspaceId = (created as { workspaceId: string }).workspaceId;

    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listWorkspaces)!.execute({}))
      .resolves.toMatchObject({
        workspaces: [expect.objectContaining({
          id: workspaceId,
          title: "Agent board",
          url: `/blackboard?workspace=${encodeURIComponent(workspaceId)}`,
          active: true,
        })],
      });
    await byName.get(BLACKBOARD_AGENT_TOOL_NAMES.writeFile)!.execute({
      workspaceId,
      path: "panels/agent.panel",
      content: "Created from the origin",
    });
    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.readFile)!.execute({
      workspaceId,
      path: "panels/agent.panel",
    })).resolves.toMatchObject({ workspaceId, content: "Created from the origin" });
    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.check)!.execute({ workspaceId }))
      .resolves.toMatchObject({ ok: true, workspaceId });
  });

  it("opens an existing workspace as the default target", async () => {
    const { repository, byName } = createTools(`agent-tools-open-${crypto.randomUUID()}`);
    await repository.createWorkspace({ id: "first", title: "First" });
    await repository.createWorkspace({ id: "second", title: "Second" });

    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.openWorkspace)!.execute({
      workspaceId: "second",
    })).resolves.toMatchObject({
      ok: true,
      workspaceId: "second",
      title: "Second",
      active: true,
    });
    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.check)!.execute({}))
      .resolves.toMatchObject({ ok: true, workspaceId: "second" });
  });

  it("returns a structured error when the explicit workspace does not exist", async () => {
    const { byName } = createTools(`agent-tools-missing-${crypto.randomUUID()}`);

    await expect(byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listFiles)!.execute({
      workspaceId: "missing",
    })).resolves.toEqual({
      ok: false,
      code: "workspace_not_found",
      workspaceId: "missing",
      message: "Blackboard workspace not found: missing",
    });
  });

  it("returns revision conflicts without changing the workspace", async () => {
    const { repository, byName } = createTools(`agent-tools-conflict-${crypto.randomUUID()}`);
    const source = await repository.createWorkspace({ id: "board" });
    const write = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.writeFile)!;

    await expect(write.execute({
      workspaceId: "board",
      path: "panels/conflict.panel",
      content: "Stale",
      baseRevision: source.workspace.revision - 1,
    })).resolves.toEqual({
      ok: false,
      code: "revision_conflict",
      currentRevision: source.workspace.revision,
    });
    expect(await repository.readWorkspace("board"))
      .not.toMatchObject({ files: expect.arrayContaining([
        expect.objectContaining({ path: "panels/conflict.panel" }),
      ]) });
  });

  it("distinguishes stored files from sources visible on the Canvas", async () => {
    const { repository, byName } = createTools(`agent-tools-graph-${crypto.randomUUID()}`);
    const created = await repository.createWorkspace({ id: "board" });
    const listFiles = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.listFiles)!;
    const writeFile = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.writeFile)!;
    const check = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.check)!;

    await expect(listFiles.execute({ workspaceId: "board" })).resolves.toMatchObject({
      entrypoint: "blackboard.yaml",
      projectionStatus: "valid",
      sourceGraph: {
        visibleFiles: ["panels/welcome.panel"],
        draftFiles: [],
        unreferencedFiles: [],
      },
    });

    const orphan = await writeFile.execute({
      workspaceId: "board",
      path: "gpu-intro.chardesk",
      content: "GPU",
      baseRevision: created.workspace.revision,
    });
    expect(orphan).toMatchObject({
      ok: true,
      projectionStatus: "unchanged",
      projectionChanged: false,
      sourceGraph: { unreferencedFiles: ["gpu-intro.chardesk"] },
      warnings: [expect.stringContaining("not visible on the Canvas")],
    });

    await expect(check.execute({ workspaceId: "board" })).resolves.toMatchObject({
      ok: true,
      sourceGraph: { unreferencedFiles: ["gpu-intro.chardesk"] },
      warnings: [expect.stringContaining("gpu-intro.chardesk")],
    });

    const visible = await writeFile.execute({
      workspaceId: "board",
      path: "panels/welcome.panel",
      content: "Visible GPU",
      baseRevision: (orphan as { revision: number }).revision,
    });
    expect(visible).toMatchObject({
      projectionStatus: "updated",
      projectionChanged: true,
    });

    const draft = await byName.get(BLACKBOARD_AGENT_TOOL_NAMES.applyPatch)!.execute({
      workspaceId: "board",
      baseRevision: (visible as { revision: number }).revision,
      operations: [
        {
          op: "replace",
          path: "blackboard.yaml",
          oldText: "layout:\n",
          newText: "  draft:\n    source: panels/draft.panel\nlayout:\n",
        },
        { op: "write", path: "panels/draft.panel", content: "Later" },
      ],
    });
    expect(draft).toMatchObject({
      projectionStatus: "unchanged",
      projectionChanged: false,
      sourceGraph: { draftFiles: ["panels/draft.panel"] },
      warnings: expect.arrayContaining([expect.stringContaining("not used by layout.areas")]),
    });
  });

  it("evaluates an atomic manifest and panel patch as one final projection", async () => {
    const { repository, byName } = createTools(`agent-tools-patch-${crypto.randomUUID()}`);
    const created = await repository.createWorkspace({ id: "board" });
    const applyPatch = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.applyPatch)!;

    const result = await applyPatch.execute({
      workspaceId: "board",
      baseRevision: created.workspace.revision,
      operations: [
        {
          op: "replace",
          path: "blackboard.yaml",
          oldText: "source: panels/welcome.panel",
          newText: "source: panels/gpu.panel",
        },
        { op: "write", path: "panels/gpu.panel", content: "GPU pipeline" },
        { op: "delete", path: "panels/welcome.panel" },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      changed: ["blackboard.yaml", "panels/gpu.panel", "panels/welcome.panel"],
      projectionStatus: "updated",
      projectionChanged: true,
      sourceGraph: {
        visibleFiles: ["panels/gpu.panel"],
        unreferencedFiles: [],
      },
      warnings: [],
    });
  });

  it("persists invalid source while reporting that the projection stayed unchanged", async () => {
    const { repository, byName } = createTools(`agent-tools-invalid-${crypto.randomUUID()}`);
    const created = await repository.createWorkspace({ id: "board" });
    const deleteFile = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.deleteFile)!;
    const check = byName.get(BLACKBOARD_AGENT_TOOL_NAMES.check)!;

    await expect(deleteFile.execute({
      workspaceId: "board",
      path: "panels/welcome.panel",
      baseRevision: created.workspace.revision,
    })).resolves.toMatchObject({
      ok: true,
      projectionStatus: "invalid",
      projectionChanged: false,
      sourceGraph: { visibleFiles: ["panels/welcome.panel"] },
      warnings: [expect.stringContaining("last valid Canvas remains visible")],
    });

    await expect(check.execute({ workspaceId: "board" })).resolves.toMatchObject({
      ok: false,
      code: "invalid_workspace",
      message: expect.stringContaining("last valid Canvas remains visible"),
    });
  });
});
