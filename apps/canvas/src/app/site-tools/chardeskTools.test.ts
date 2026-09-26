import { describe, expect, it } from "vitest";
import materials from "../../../../../.agents/skills/chardesk/references/materials.md?raw";
import {
  CHARDESK_AGENT_TOOL_NAMES,
  createChardeskMaterialsTool,
} from "./chardeskTools";

describe("CharDesk agent tools", () => {
  it("exposes the canonical visual materials as read-only Markdown", async () => {
    const tool = createChardeskMaterialsTool();

    expect(tool).toMatchObject({
      name: CHARDESK_AGENT_TOOL_NAMES.readMaterials,
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
