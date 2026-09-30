import type { AgentToolDefinition } from "./contracts.ts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";
export const CANVAS_SEARCH_TOOL_NAME = "chardesk_canvas_search";
export const CANVAS_MANAGE_TOOL_NAME = "chardesk_canvas_manage";

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

export const CANVAS_MANAGE_TOOL = {
  name: CANVAS_MANAGE_TOOL_NAME,
  title: "Manage Canvases",
  description: "Manage Canvas lifecycle state. Supports list, create, rename, and archive.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    action: { enum: ["list", "create", "rename", "archive"] },
    canvasId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    mode: { enum: ["freeform", "slide"] },
  }, required: ["action"], additionalProperties: false },
  outputSchema: { type: "object" },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_READ_TOOL = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map or an optional image block. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Default representation is text: precision is automatic, with original Unicode and non-empty style notes; projection and density are navigation symbols without style notes. Choose image for layout/color overview or both to compare image and text. Move or resize the rectangle to pan or zoom. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional target Canvas ID. Omit to use the active Canvas." },
      viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "[x,y,width,height]; signed coordinates, positive sizes." },
      representation: { enum: ["text", "image", "both"], default: "text", description: "Read representation. text is the default and preserves Cell characters/coordinates; image is for visual layout/color; both returns both blocks." },
      detail: { enum: ["low", "high", "original", "auto"], default: "auto", description: "Image rendering detail. Only used for image/both; defaults to auto." },
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
        representation: { enum: ["text", "image", "both"] },
        detail: { enum: ["low", "high", "original", "auto"] },
        image: { anyOf: [{ type: "object" }, { type: "null" }] },
        content: { type: "string" },
        contentBlocks: { type: "array", items: { type: "object" } },
      }, required: ["canvasId", "viewport", "step", "mode", "representation", "content", "contentBlocks"], additionalProperties: false },
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
