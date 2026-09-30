import { CanvasWriteError, isCanvasReadViewport, readCanvasViewport, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolDefinition } from "./contracts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";

export const createCanvasWriteTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState"> & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeAt"> };
  },
): AgentToolDefinition => ({
  name: CANVAS_WRITE_TOOL_NAME,
  title: "Write Canvas text",
  description: "Write plain Unicode content at [x,y] in original Cell coordinates on the current editable Canvas. Each newline returns to the starting column. Written characters replace existing characters, explicit spaces clear characters while preserving backgrounds, and unwritten positions remain unchanged. No wrapping or scaling. Returns bounds [x,y,width,height] for canvas_read. Does not move the user's camera, cursor, or selection. Source-backed Canvases require source-file editing; Slide overflow is rejected without writing.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "[x,y] in original Cell coordinates; signed safe integers." },
      content: { type: "string", description: "Plain Unicode text, not a read tool's coordinate rulers or sampled map. Tabs and control characters are unsupported." },
    },
    required: ["at", "content"],
    additionalProperties: false,
  },
  outputSchema: {
    oneOf: [
      { type: "object", properties: {
        canvasId: { type: "string" },
        bounds: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
      }, required: ["canvasId", "bounds"], additionalProperties: false },
      { type: "object", properties: {
        ok: { const: false },
        code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_ready", "source_backed_canvas", "out_of_bounds", "write_failed"] },
        message: { type: "string" },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
  execute: async (input) => {
    const at = input.at;
    if (Object.keys(input).some((key) => key !== "at" && key !== "content")
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) || typeof input.content !== "string") {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: string } with safe integer coordinates." };
    }
    try {
      await canvas.ready;
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
    }
    const canvasId = canvas.getState().activeCanvasId;
    if (!canvasId) return { ok: false, code: "canvas_not_active", message: "Open a Canvas first." };
    try {
      const bounds = canvas.commands.text.writeAt(input.content, { x: at[0], y: at[1] });
      return { canvasId, bounds };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "write_failed",
        message: error instanceof CanvasWriteError ? error.message : "Unable to write Canvas content." };
    }
  },
});

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
