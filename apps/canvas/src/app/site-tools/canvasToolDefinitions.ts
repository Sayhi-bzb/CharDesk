import type { AgentToolDefinition } from "./contracts.ts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";
export const CANVAS_SEARCH_TOOL_NAME = "chardesk_canvas_search";

export const CANVAS_SEARCH_TOOL = {
  name: CANVAS_SEARCH_TOOL_NAME,
  title: "Search Canvas text",
  description: "Search the current Canvas's rendered text at original Cell precision. Case-sensitive literal search on a single row, with whole grapheme boundaries and non-overlapping matches. Optional input viewport limits matching, not the surrounding previews. Returns up to 20 results ordered by matched y then x. Each result has a 32x5 Cell viewport and its plain rectangular content, preserving spaces and newlines without borders, rulers, style notes, or word-aware cropping. Normally the match starts 8 Cells from the left and 2 rows from the top; near safe coordinate limits the window shifts. Long words or queries can be cropped; clipped wide glyphs are left blank. Pass non-null next as after [x,y] with the same query and viewport to continue; next is a matched position, not a preview origin. Confirm canvasId is unchanged. Calls observe current content, not a shared snapshot. Use canvas_read on a result viewport for styles or expand it for more context. Does not edit content or move the user's camera.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, description: "Literal Unicode text, including a non-whitespace character; no line breaks or control characters." },
      viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "Optional [x,y,width,height] in original Cells; positive sizes." },
      after: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "Previous response's next [x,y]. Reuse the query and viewport on the same Canvas." },
    },
    required: ["query"], additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      { type: "object", properties: {
        canvasId: { type: "string" },
        matches: { type: "array", maxItems: 20, items: { type: "object", properties: {
          viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
          content: { type: "string" },
        }, required: ["viewport", "content"], additionalProperties: false } },
        next: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, { type: "null" }] },
      }, required: ["canvasId", "matches", "next"], additionalProperties: false },
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_ready", "search_failed"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_READ_TOOL = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Precision is automatic: text includes original Unicode and non-empty style notes with inclusive y/x Cell ranges; projection and density are navigation symbols without style notes. Move or resize the rectangle to pan or zoom. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: { viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "[x,y,width,height]; signed coordinates, positive sizes." } },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
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
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_WRITE_TOOL = {
  name: CANVAS_WRITE_TOOL_NAME,
  title: "Write Canvas text",
  description: "Render text using the current Canvas text-rendering settings (auto, raw, ANSI, or Markdown), then write the resulting Cells at [x,y]. canvas_read discloses the current rendering settings. Only rendered Cells are stored, not the input source. Written positions replace existing characters and styles; unwritten positions remain unchanged. Existing backgrounds are preserved unless the renderer supplies a background. Returns rendered bounds [x,y,width,height] for canvas_read. Does not move the user's camera, cursor, or selection. Source-backed Canvases require source-file editing; Slide overflow is rejected without writing.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "[x,y] in original Cell coordinates; signed safe integers." },
      content: { type: "string", description: "Text to render with the current settings; Markdown and ANSI work when enabled. Tabs and layout follow the shared text renderer. Do not copy read rulers, style notes, or sampled maps." },
    },
    required: ["at", "content"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
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
} satisfies Omit<AgentToolDefinition, "execute">;
