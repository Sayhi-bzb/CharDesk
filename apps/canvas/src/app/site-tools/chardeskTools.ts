import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool, createCanvasSearchTool, createCanvasListTool } from "./canvasTools";
import { createChardeskMaterialsTool } from "./materialsTools";
import type { CanvasToolRendering } from "./canvasRendering";

type ChardeskAgentToolDependencies = Readonly<{
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession"> & Parameters<typeof createCanvasWriteTool>[0];
  readOnly?: boolean;
  rendering: CanvasToolRendering;
}>;

export const createChardeskAgentToolGroups = (
  dependencies: ChardeskAgentToolDependencies,
): Readonly<Record<"materials" | "canvas", readonly AgentToolDefinition[]>> => ({
  materials: [createChardeskMaterialsTool()],
  canvas: [createCanvasListTool(dependencies.canvas), createCanvasReadTool(dependencies.canvas, dependencies.rendering), createCanvasSearchTool(dependencies.canvas), ...(dependencies.readOnly ? [] : [createCanvasWriteTool(dependencies.canvas, dependencies.rendering)])],
});

export const createChardeskAgentTools = (
  dependencies: ChardeskAgentToolDependencies,
): readonly AgentToolDefinition[] => Object.values(createChardeskAgentToolGroups(dependencies)).flat();
