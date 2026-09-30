import { isCanvasReadViewport, readCanvasViewport, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolDefinition } from "./contracts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";

export const createCanvasReadTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession">,
): AgentToolDefinition => ({
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Precision is automatic: text is original Unicode; projection and density are generated navigation symbols. Move or resize the rectangle to pan or zoom. This does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: { viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "[x,y,width,height]; signed coordinates, positive sizes." } },
    additionalProperties: false,
  },
  outputSchema: {
    oneOf: [
      { type: "object", properties: {
        canvasId: { type: "string" },
        viewport: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
        step: { type: "integer", minimum: 1 },
        mode: { enum: ["text", "projection", "density"] },
        content: { type: "string" },
      }, required: ["canvasId", "viewport", "step", "mode", "content"], additionalProperties: false },
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_ready"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
  execute: async (input) => {
    if (Object.keys(input).some((key) => key !== "viewport") || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))) {
      return { ok: false, code: "invalid_input", message: "Expected an optional viewport [x,y,width,height] with safe integer coordinates and positive sizes." };
    }
    try {
      await canvas.ready;
      const canvasId = canvas.getState().activeCanvasId;
      if (!canvasId) return { ok: false, code: "canvas_not_active", message: "Open a Canvas first." };
      const snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
      return { canvasId, ...readCanvasViewport(snapshot.surface, input.viewport) };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
  },
});
