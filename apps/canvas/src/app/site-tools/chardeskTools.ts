import type { BlackboardRuntime } from "@/domains/blackboard/public";
import type { BlackboardWorkspaceTarget } from "../blackboardWorkspaceTarget";
import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import {
  BLACKBOARD_AGENT_TOOL_NAMES,
  createBlackboardAgentTools,
} from "./blackboardTools";
import type { AgentToolDefinition } from "./contracts";
import type { CanvasRuntime } from "@/domains/canvas/public";
import { CANVAS_READ_TOOL_NAME, createCanvasReadTool } from "./canvasTools";

export const CHARDESK_AGENT_TOOL_NAMES = {
  readMaterials: "chardesk_read_materials",
  readCanvas: CANVAS_READ_TOOL_NAME,
  ...BLACKBOARD_AGENT_TOOL_NAMES,
} as const;

export const createChardeskMaterialsTool = (): AgentToolDefinition => ({
  name: CHARDESK_AGENT_TOOL_NAMES.readMaterials,
  title: "Read CharDesk materials",
  description:
    "Load CharDesk's visual language, composition materials, and worked examples for authoring or visually restructuring content.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object",
    properties: {
      format: { const: "text/markdown" },
      content: { type: "string" },
    },
    required: ["format", "content"],
    additionalProperties: false,
  },
  readOnly: true,
  execute: () => ({ format: "text/markdown", content: materials }),
});

export const createChardeskAgentTools = (
  dependencies: Readonly<{
    blackboard: BlackboardRuntime;
    workspaceTarget: BlackboardWorkspaceTarget;
    canvas: CanvasRuntime;
  }>,
): readonly AgentToolDefinition[] => [
  createChardeskMaterialsTool(),
  createCanvasReadTool(dependencies.canvas),
  ...createBlackboardAgentTools(dependencies),
];
