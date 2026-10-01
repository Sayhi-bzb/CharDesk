import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool, createCanvasSearchTool, createCanvasManageTool } from "./canvasTools";
import { createChardeskMaterialsTool } from "./materialsTools";
import type { CanvasToolRendering } from "./canvasRendering";

type ChardeskAgentToolDependencies = Readonly<{
  canvas: Parameters<typeof createCanvasManageTool>[0] & Parameters<typeof createCanvasWriteTool>[0] & Pick<CanvasRuntime, "materializeSession">;
  readOnly?: boolean;
  rendering: CanvasToolRendering;
}>;

export const createChardeskAgentToolGroups = (
  dependencies: ChardeskAgentToolDependencies,
): Readonly<Record<"materials" | "canvas", readonly AgentToolDefinition[]>> => ({
  materials: [createChardeskMaterialsTool()],
  canvas: [createCanvasManageTool(dependencies.canvas, dependencies.readOnly), createCanvasReadTool(dependencies.canvas, dependencies.rendering), createCanvasSearchTool(dependencies.canvas), ...(dependencies.readOnly ? [] : [createCanvasWriteTool(dependencies.canvas, dependencies.rendering)])],
});

export const createChardeskAgentTools = (
  dependencies: ChardeskAgentToolDependencies,
): readonly AgentToolDefinition[] => Object.values(createChardeskAgentToolGroups(dependencies)).flat();
