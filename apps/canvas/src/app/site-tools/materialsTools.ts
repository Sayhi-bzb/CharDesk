import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import type { AgentToolDefinition } from "./contracts";

export const MATERIALS_READ_TOOL_NAME = "chardesk_read_materials";

export const createChardeskMaterialsTool = (): AgentToolDefinition => ({
  name: MATERIALS_READ_TOOL_NAME,
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
