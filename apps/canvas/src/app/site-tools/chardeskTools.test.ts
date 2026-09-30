// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createGridSurfaceReader, type CanvasRuntime } from "@/domains/canvas/public";
import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import { createChardeskMaterialsTool, MATERIALS_READ_TOOL_NAME } from "./materialsTools";
import { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME } from "./canvasTools";
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
  it("groups read, search, and write as spatial Canvas capabilities", () => {
    const dependencies = { canvas, rendering };
    const groups = createChardeskAgentToolGroups(dependencies);
    expect(groups.materials.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME]);
    expect(groups.canvas.map(({ name }) => name)).toEqual([CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_WRITE_TOOL_NAME]);
    const names = createChardeskAgentTools(dependencies).map(({ name }) => name);
    expect(names).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_WRITE_TOOL_NAME]);
    expect(new Set(names).size).toBe(4);
  });

  it("composes read-only pages without a Blackboard runtime", async () => {
    const groups = createChardeskAgentToolGroups({ canvas, rendering, readOnly: true });
    const tools = createChardeskAgentTools({ canvas, rendering, readOnly: true });
    expect(tools.map(({ name }) => name)).toEqual([MATERIALS_READ_TOOL_NAME, CANVAS_READ_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME]);
    expect(tools.every(({ readOnly }) => readOnly)).toBe(true);
    expect(await groups.canvas[0].execute({})).toMatchObject({ canvasId: "canvas-a", viewport: null });
    expect(await groups.canvas[1].execute({ query: "Hello" })).toMatchObject({ canvasId: "canvas-a", matches: [], next: null });
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
