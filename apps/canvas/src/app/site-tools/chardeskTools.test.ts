// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { BlackboardRuntime, IndexedDbBlackboardRepository } from "@/domains/blackboard/public";
import { createGridSurfaceReader, type CanvasRuntime } from "@/domains/canvas/public";
import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import { createChardeskMaterialsTool, MATERIALS_READ_TOOL_NAME } from "./materialsTools";
import { BLACKBOARD_AGENT_TOOL_NAMES } from "./blackboardTools";
import { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME } from "./canvasTools";
import { createChardeskAgentToolGroups, createChardeskAgentTools } from "./chardeskTools";
import { createTextRenderingRuntime } from "@/domains/document/public";
const runtime = createTextRenderingRuntime();
const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };

const canvas = {
  commands: { text: { writeAt: () => null, writeRowsAt: () => null } },
  ready: Promise.resolve(),
  getState: () => ({ activeCanvasId: "canvas-a" }) as ReturnType<CanvasRuntime["getState"]>,
  materializeSession: async () => ({
    id: "canvas-a", name: "Example", mode: "freeform" as const,
    surface: createGridSurfaceReader(new Map()), slideDeck: null,
  }),
};

describe("CharDesk agent tools", () => {
  const repositories: IndexedDbBlackboardRepository[] = [];
  afterEach(async () => Promise.all(repositories.splice(0).map((repository) => repository.close())));

  it("keeps file operations in Blackboard and spatial reading in Canvas", () => {
    const repository = new IndexedDbBlackboardRepository({ databaseName: `tool-groups-${crypto.randomUUID()}` });
    repositories.push(repository);
    const dependencies = {
      canvas,
      rendering,
      blackboard: {
        blackboard: new BlackboardRuntime(repository),
        workspaceTarget: { getActiveWorkspaceId: () => null, activateWorkspace: async () => {} },
      },
    };
    const groups = createChardeskAgentToolGroups(dependencies);
    expect(groups.materials.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME]);
    expect(groups.canvas.map(({ name }) => name)).toEqual([CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME]);
    expect(groups.blackboard.map(({ name }) => name)).toEqual(Object.values(BLACKBOARD_AGENT_TOOL_NAMES));
    const names = createChardeskAgentTools(dependencies).map(({ name }) => name);
    expect(names).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, ...Object.values(BLACKBOARD_AGENT_TOOL_NAMES)]);
    expect(new Set(names).size).toBe(12);
  });

  it("composes read-only pages without a Blackboard runtime", async () => {
    const groups = createChardeskAgentToolGroups({ canvas, rendering, readOnly: true });
    expect(groups.blackboard).toEqual([]);
    const tools = createChardeskAgentTools({ canvas, rendering, readOnly: true });
    expect(tools.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_READ_TOOL_NAME]);
    expect(tools.every(({ readOnly }) => readOnly)).toBe(true);
    expect(await groups.canvas[0].execute({})).toMatchObject({ canvasId: "canvas-a", viewport: null });
  });

  it("exposes the canonical visual materials as read-only Markdown", async () => {
    const tool = createChardeskMaterialsTool();

    expect(tool).toMatchObject({
      name: MATERIALS_READ_TOOL_NAME,
      title: "Read CharDesk materials",
      readOnly: true,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    });
    expect(await tool.execute({})).toEqual({
      format: "text/markdown",
      content: materials,
    });
  });
});
