import type { AgentToolDefinition } from "./contracts.ts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";
export const CANVAS_SEARCH_TOOL_NAME = "chardesk_canvas_search";
export const CANVAS_LIST_TOOL_NAME = "chardesk_canvas_list";

export const CANVAS_SEARCH_TOOL = {
  name: CANVAS_SEARCH_TOOL_NAME,
  title: "Search Canvas text",
  description: "Search rendered Canvas text at original Cell precision. Literal and case-sensitive by default; regex enables RE2 syntax (no lookaround/backreferences), ignoreCase enables Unicode case folding. Actual LF separates a spatial template: each non-blank row must match at the same x on consecutive Canvas rows; widths may differ. Each row consumes complete graphemes and non-empty text; zero-length regex matches are skipped. Regex ^/$ refer to the finite stored row envelope clipped by viewport, not template origin or arbitrary storage spans. Missing spaces inside that envelope participate; regex envelopes over 16384 Cells and budget exhaustion return search_limit, never partial results. Narrow viewport to retry. Input viewport contains the whole match, not the preview. Returns up to 20 non-overlapping origins in y/x order, each with plain 32x5 viewport/content, normally 8 Cells left and 2 rows above. Spaces/newlines are preserved without rulers, borders, styles, or word-aware cropping; partial wide glyphs are blank. Continue with next as after using identical query, regex, ignoreCase, viewport and canvasId. next is the match origin, not preview origin. Calls are live, not a snapshot. Use canvas_read for styles or more context. Does not edit or move the camera.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 4096, description: "Literal text or RE2 patterns. Actual LF separates up to 64 aligned template rows; each row must contain non-whitespace text. No other control characters." },
      canvasId: { type: "string", minLength: 1, description: "Optional target Canvas ID. Omit to use the active Canvas." },
      regex: { type: "boolean", default: false, description: "Interpret each template row as an RE2 pattern, not a JavaScript regex literal." },
      ignoreCase: { type: "boolean", default: false, description: "Case-insensitive matching in both literal and regex modes." },
      viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "Optional [x,y,width,height] in original Cells; positive sizes." },
      after: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "Previous response's next [x,y]. Reuse all matching options on the same Canvas." },
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
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied", "search_failed", "search_limit"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_LIST_TOOL = {
  name: CANVAS_LIST_TOOL_NAME,
  title: "List Canvases",
  description: "List all Canvases visible to this CharDesk instance. Use canvasId from the result with canvas_read, canvas_search, and canvas_write. This does not change the user's active Canvas.",
  readOnly: true,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object", oneOf: [
    { type: "object", properties: { canvases: { type: "array", items: { type: "object", properties: {
      canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] }, active: { type: "boolean" }, editable: { type: "boolean" },
    }, required: ["canvasId", "name", "mode", "active", "editable"], additionalProperties: false } } }, required: ["canvases"], additionalProperties: false },
    { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_ready", "permission_denied"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
  ] },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_READ_TOOL = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Precision is automatic: text includes original Unicode and non-empty style notes with inclusive y/x Cell ranges; projection and density are navigation symbols without style notes. Move or resize the rectangle to pan or zoom. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional target Canvas ID. Omit to use the active Canvas." },
      viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "[x,y,width,height]; signed coordinates, positive sizes." },
    },
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
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
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
      canvasId: { type: "string", minLength: 1, description: "Optional target Canvas ID. Omit to use the active Canvas." },
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
        code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied", "source_backed_canvas", "out_of_bounds", "write_failed"] },
        message: { type: "string" },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;
