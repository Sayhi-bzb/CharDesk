import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool, createCanvasRenderTool, createCanvasEraseTool, createCanvasFillTool, createCanvasSearchTool, createCanvasManageTool, createCanvasPreviewWriteTool, createCanvasPreviewRenderTool } from "./canvasTools";
import { createCanvasCodeTool } from "./canvasCode";
import { createChardeskMaterialsTool } from "./materialsTools";
import type { CanvasToolRendering } from "./canvasRendering";

type ChardeskAgentToolDependencies = Readonly<{
  canvas: Parameters<typeof createCanvasManageTool>[0] & Parameters<typeof createCanvasWriteTool>[0] & Parameters<typeof createCanvasRenderTool>[0] & Parameters<typeof createCanvasEraseTool>[0] & Parameters<typeof createCanvasFillTool>[0] & Pick<CanvasRuntime, "materializeSession"> & { commands: { history?: { beginCheckpoint: (operationId?: string, canvasId?: string) => { commit: () => void; cancel: () => void }; undoOperation?: (operationId: string) => boolean } } };
  readOnly?: boolean;
  rendering: CanvasToolRendering;
}>;

export const createChardeskAgentToolGroups = (
  dependencies: ChardeskAgentToolDependencies,
): Readonly<Record<"materials" | "canvas", readonly AgentToolDefinition[]>> => ({
  materials: [createChardeskMaterialsTool()],
  canvas: [createCanvasManageTool(dependencies.canvas, dependencies.readOnly), createCanvasReadTool(dependencies.canvas, dependencies.rendering), createCanvasSearchTool(dependencies.canvas), ...(dependencies.readOnly ? [] : [createCanvasWriteTool(dependencies.canvas), createCanvasEraseTool(dependencies.canvas), createCanvasFillTool(dependencies.canvas), createCanvasRenderTool(dependencies.canvas, dependencies.rendering), createCanvasCodeTool({
    manage: createCanvasManageTool(dependencies.canvas),
    read: createCanvasReadTool(dependencies.canvas, dependencies.rendering),
    search: createCanvasSearchTool(dependencies.canvas),
    write: createCanvasWriteTool(dependencies.canvas),
    erase: createCanvasEraseTool(dependencies.canvas),
    fill: createCanvasFillTool(dependencies.canvas),
    render: createCanvasRenderTool(dependencies.canvas, dependencies.rendering),
    previewWrite: createCanvasPreviewWriteTool(dependencies.canvas),
    previewRender: createCanvasPreviewRenderTool(dependencies.canvas, dependencies.rendering),
    history: dependencies.canvas.commands.history,
  })])],
});

export const createChardeskAgentTools = (
  dependencies: ChardeskAgentToolDependencies,
): readonly AgentToolDefinition[] => Object.values(createChardeskAgentToolGroups(dependencies)).flat();
