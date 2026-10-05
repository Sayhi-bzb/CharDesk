// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createGridSurfaceReader, type CanvasRuntime } from "@/domains/canvas/public";
import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import { createChardeskMaterialsTool, MATERIALS_READ_TOOL_NAME } from "./materialsTools";
import { CANVAS_MANAGE_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_ERASE_TOOL_NAME, CANVAS_FILL_TOOL_NAME, CANVAS_RENDER_TOOL_NAME } from "./canvasTools";
import { CANVAS_CODE_TOOL_NAME } from "./canvasCode";
import { createChardeskAgentToolGroups, createChardeskAgentTools } from "./chardeskTools";
import { createTextRenderingRuntime } from "@/domains/document/public";
import { localToolContracts } from "@chardesk/mcp/contracts";
import {
  CANVAS_CODE_TOOL,
  CANVAS_ERASE_TOOL,
  CANVAS_FILL_TOOL,
  CANVAS_MANAGE_TOOL,
  CANVAS_READ_TOOL,
  CANVAS_RENDER_TOOL,
  CANVAS_SEARCH_TOOL,
  CANVAS_WRITE_TOOL,
} from "./canvasToolDefinitions";
const runtime = createTextRenderingRuntime();
const rendering = { render: runtime.renderCompact, getProfile: runtime.getProfile, getContext: () => ({ themeMode: "light" as const }) };

const canvas = {
  commands: { text: { writeAt: () => null, writeRowsAt: () => null }, sessions: { create: () => ({ id: "canvas-b", name: "New", mode: "freeform" as const }), rename: () => {}, archive: () => true } },
  ready: Promise.resolve(),
  getState: () => ({ activeCanvasId: "canvas-a" }) as ReturnType<CanvasRuntime["getState"]>,
  materializeSession: async () => ({
    id: "canvas-a", name: "Example", mode: "freeform" as const,
    surface: createGridSurfaceReader(new Map()), slideDeck: null,
  }),
};

describe("CharDesk agent tools", () => {
  it("uses the local MCP contracts for browser-hosted Canvas tools", () => {
    const browserTools = [
      CANVAS_CODE_TOOL,
      CANVAS_ERASE_TOOL,
      CANVAS_FILL_TOOL,
      CANVAS_MANAGE_TOOL,
      CANVAS_READ_TOOL,
      CANVAS_RENDER_TOOL,
      CANVAS_SEARCH_TOOL,
      CANVAS_WRITE_TOOL,
    ];
    const contracts = new Map(localToolContracts.map((tool) => [tool.name, tool]));
    for (const tool of browserTools) {
      const contract = contracts.get(tool.name);
      expect(contract).toBeDefined();
      expect(tool.title).toBe(contract?.title);
      expect(tool.description).toBe(contract?.description);
      expect(tool.readOnly).toBe(contract?.readOnly);
      expect(tool.inputSchema).toEqual(contract?.inputSchema);
    }
  });

  it("groups read, search, and write as spatial Canvas capabilities", () => {
    const dependencies = { canvas, rendering };
    const groups = createChardeskAgentToolGroups(dependencies);
    expect(groups.materials.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME]);
    expect(groups.canvas.map(({ name }) => name)).toEqual([CANVAS_MANAGE_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_ERASE_TOOL_NAME, CANVAS_FILL_TOOL_NAME, CANVAS_RENDER_TOOL_NAME, CANVAS_CODE_TOOL_NAME]);
    const names = createChardeskAgentTools(dependencies).map(({ name }) => name);
    expect(names).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_MANAGE_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_ERASE_TOOL_NAME, CANVAS_FILL_TOOL_NAME, CANVAS_RENDER_TOOL_NAME, CANVAS_CODE_TOOL_NAME]);
    expect(new Set(names).size).toBe(9);
  });

  it("composes read-only pages without a Blackboard runtime", async () => {
    const groups = createChardeskAgentToolGroups({ canvas, rendering, readOnly: true });
    const tools = createChardeskAgentTools({ canvas, rendering, readOnly: true });
    expect(tools.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_MANAGE_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME]);
    expect(tools.every(({ readOnly }) => readOnly)).toBe(true);
    expect(await groups.canvas[1].execute({})).toMatchObject({ viewport: null, overviewOnly: false });
    expect(await groups.canvas[2].execute({ query: "Hello" })).toMatchObject({ matches: [], next: null });
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
