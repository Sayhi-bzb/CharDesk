import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool, createCanvasSearchTool, createCanvasManageTool, createCanvasPreviewWriteTool } from "./canvasTools";
import { createCanvasCodeTool } from "./canvasCode";
import { createChardeskMaterialsTool } from "./materialsTools";
import type { CanvasToolRendering } from "./canvasRendering";

type ChardeskAgentToolDependencies = Readonly<{
  canvas: Parameters<typeof createCanvasManageTool>[0] & Parameters<typeof createCanvasWriteTool>[0] & Pick<CanvasRuntime, "materializeSession"> & { commands: { history?: { beginCheckpoint: () => { commit: () => void; cancel: () => void } } } };
  readOnly?: boolean;
  rendering: CanvasToolRendering;
}>;

export const createChardeskAgentToolGroups = (
  dependencies: ChardeskAgentToolDependencies,
): Readonly<Record<"materials" | "canvas", readonly AgentToolDefinition[]>> => ({
  materials: [createChardeskMaterialsTool()],
  canvas: [createCanvasManageTool(dependencies.canvas, dependencies.readOnly), createCanvasReadTool(dependencies.canvas, dependencies.rendering), createCanvasSearchTool(dependencies.canvas), ...(dependencies.readOnly ? [] : [createCanvasWriteTool(dependencies.canvas, dependencies.rendering), createCanvasCodeTool({
    manage: createCanvasManageTool(dependencies.canvas),
    read: createCanvasReadTool(dependencies.canvas, dependencies.rendering),
    search: createCanvasSearchTool(dependencies.canvas),
    write: createCanvasWriteTool(dependencies.canvas, dependencies.rendering),
    previewWrite: createCanvasPreviewWriteTool(dependencies.canvas, dependencies.rendering),
    history: dependencies.canvas.commands.history,
  })])],
});

export const createChardeskAgentTools = (
  dependencies: ChardeskAgentToolDependencies,
): readonly AgentToolDefinition[] => Object.values(createChardeskAgentToolGroups(dependencies)).flat();
