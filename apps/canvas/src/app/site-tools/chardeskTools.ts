import type { BlackboardRuntime } from "@/domains/blackboard/public";
import type { BlackboardWorkspaceTarget } from "../blackboardWorkspaceTarget";
import { createBlackboardAgentTools } from "./blackboardTools";
import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { createCanvasReadTool, createCanvasWriteTool } from "./canvasTools";
import { createChardeskMaterialsTool } from "./materialsTools";
import type { CanvasToolRendering } from "./canvasRendering";

type ChardeskAgentToolDependencies = Readonly<{
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession"> & Parameters<typeof createCanvasWriteTool>[0];
  readOnly?: boolean;
  rendering: CanvasToolRendering;
  blackboard?: Readonly<{
    blackboard: BlackboardRuntime;
    workspaceTarget: BlackboardWorkspaceTarget;
  }>;
}>;

export const createChardeskAgentToolGroups = (
  dependencies: ChardeskAgentToolDependencies,
): Readonly<Record<"materials" | "canvas" | "blackboard", readonly AgentToolDefinition[]>> => ({
  materials: [createChardeskMaterialsTool()],
  canvas: [createCanvasReadTool(dependencies.canvas, dependencies.rendering), ...(dependencies.readOnly ? [] : [createCanvasWriteTool(dependencies.canvas, dependencies.rendering)])],
  blackboard: dependencies.blackboard ? createBlackboardAgentTools(dependencies.blackboard) : [],
});

export const createChardeskAgentTools = (
  dependencies: ChardeskAgentToolDependencies,
): readonly AgentToolDefinition[] => Object.values(createChardeskAgentToolGroups(dependencies)).flat();
