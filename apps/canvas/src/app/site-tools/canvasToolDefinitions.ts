import type { AgentToolDefinition } from "./contracts.ts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";
export const CANVAS_SEARCH_TOOL_NAME = "chardesk_canvas_search";
export const CANVAS_MANAGE_TOOL_NAME = "chardesk_canvas_manage";
export const CANVAS_CODE_TOOL_NAME = "chardesk_canvas_code";

export const CANVAS_SEARCH_TOOL = {
  name: CANVAS_SEARCH_TOOL_NAME,
  title: "Search Canvas text",
  description: "Search rendered Canvas text at original Cell precision. Literal and case-sensitive by default; regex enables RE2 syntax (no lookaround/backreferences), ignoreCase enables Unicode case folding. Actual LF separates a spatial template: each non-blank row must match at the same x on consecutive Canvas rows; widths may differ. Each row consumes complete graphemes and non-empty text; zero-length regex matches are skipped. Regex ^/$ refer to the finite stored row envelope clipped by viewport, not template origin or arbitrary storage spans. Missing spaces inside that envelope participate; regex envelopes over 16384 Cells and budget exhaustion return search_limit, never partial results. Narrow viewport to retry. Returns up to 20 non-overlapping matches in y/x order; each match includes exact origin, bounds, and matched content without surrounding context. Continue with next as after using identical query, regex, ignoreCase, viewport and canvasRef. Calls are live, not a snapshot. Does not edit or move the camera.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 4096, description: "Literal text or RE2 patterns. Actual LF separates up to 64 aligned template rows; each row must contain non-whitespace text. No other control characters." },
      canvasRef: { type: "string", minLength: 1, description: "Optional short runtime Canvas reference from manage(list). Omit to use the active Canvas." },
      canvasId: { type: "string", minLength: 1, description: "Legacy optional target Canvas UUID; prefer canvasRef." },
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
        canvasRef: { type: "string" }, canvasId: { type: "string" },
        matches: { type: "array", maxItems: 20, items: { type: "object", properties: {
          origin: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
          bounds: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
          content: { type: "string" },
        }, required: ["origin", "bounds", "content"], additionalProperties: false } },
        next: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, { type: "null" }] },
      }, required: ["matches", "next"], additionalProperties: false },
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied", "search_failed", "search_limit"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_MANAGE_TOOL = {
  name: CANVAS_MANAGE_TOOL_NAME,
  title: "Manage Canvases",
  description: "Manage Canvas lifecycle state. Supports list, create, rename, and archive. The list action returns active Canvases by default; pass includeArchived=true to include archived Canvases. It returns short runtime canvasRef handles; use one for explicit cross-Canvas work. Omit the reference for the active Canvas.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    action: { enum: ["list", "create", "rename", "archive"] },
    canvasRef: { type: "string", minLength: 1, description: "Short runtime reference from list." },
    canvasId: { type: "string", minLength: 1, description: "Legacy optional target Canvas UUID; prefer canvasRef." },
    includeArchived: { type: "boolean", default: false, description: "Include archived Canvases in list results. Defaults to false." },
    name: { type: "string", minLength: 1 },
    mode: { enum: ["freeform", "slide"] },
  }, required: ["action"], additionalProperties: false },
  outputSchema: { type: "object", oneOf: [
    { type: "object", properties: {
      currentCanvasRef: { anyOf: [{ type: "string" }, { type: "null" }] },
      currentCanvas: { anyOf: [{ type: "object", properties: {
        canvasRef: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] },
        active: { type: "boolean" }, archived: { type: "boolean" }, editable: { type: "boolean" },
      }, required: ["canvasRef", "name", "mode", "active", "archived", "editable"], additionalProperties: false }, { type: "null" }] },
      canvases: { type: "array", items: { type: "object", properties: {
        canvasRef: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] },
        active: { type: "boolean" }, archived: { type: "boolean" }, editable: { type: "boolean" },
      }, required: ["canvasRef", "name", "mode", "active", "archived", "editable"], additionalProperties: false } },
    }, required: ["currentCanvasRef", "currentCanvas", "canvases"], additionalProperties: false },
    { type: "object", properties: { canvasRef: { type: "string" }, canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] }, active: { type: "boolean" }, archived: { type: "boolean" } }, additionalProperties: false },
    { type: "object", properties: { ok: { const: false }, code: { type: "string" }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
  ] },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_READ_TOOL = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map or an optional image block. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Default representation is text: precision is automatic, with original Unicode and non-empty style notes; projection and density are navigation symbols without style notes. When overviewOnly is true, content is sampled navigation data, not source text; narrow the viewport or use search before describing characters. Choose image for layout/color overview or both to compare image and text. Move or resize the rectangle to pan or zoom. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      canvasRef: { type: "string", minLength: 1, description: "Optional short runtime Canvas reference from manage(list). Omit to use the active Canvas." },
      canvasId: { type: "string", minLength: 1, description: "Legacy optional target Canvas UUID; prefer canvasRef." },
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
        canvasRef: { type: "string" }, canvasId: { type: "string" },
        viewport: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
        sampleSize: { type: "integer", minimum: 1 },
        mode: { enum: ["text", "projection", "density"] },
        overviewOnly: { type: "boolean", description: "True when content is sampled projection/density navigation data and must not be treated as source text." },
        representation: { enum: ["text", "image", "both"] },
        detail: { enum: ["low", "high", "original", "auto"] },
        image: { anyOf: [{ type: "object", properties: {
          mimeType: { const: "image/png" }, width: { type: "integer", minimum: 1 },
          height: { type: "integer", minimum: 1 }, scale: { type: "number", exclusiveMinimum: 0 },
        }, required: ["mimeType", "width", "height", "scale"], additionalProperties: false }, { type: "null" }] },
        content: { type: "string" },
        contentBlocks: { type: "array", items: { oneOf: [
          { type: "object", properties: { type: { const: "text" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
          { type: "object", properties: { type: { const: "note" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
          { type: "object", properties: {
            type: { const: "image" }, mimeType: { const: "image/png" }, data: { type: "string" },
            width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 }, scale: { type: "number", exclusiveMinimum: 0 },
          }, required: ["type", "mimeType", "data", "width", "height", "scale"], additionalProperties: false },
        ] } },
        structuredContent: { type: "object", properties: {
          canvasRef: { type: "string" }, canvasId: { type: "string" }, viewport: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
          sampleSize: { type: "integer", minimum: 1 }, mode: { enum: ["text", "projection", "density"] }, overviewOnly: { type: "boolean" },
          representation: { enum: ["text", "image", "both"] }, detail: { enum: ["low", "high", "original", "auto"] },
          image: { anyOf: [{ type: "object" }, { type: "null" }] },
        }, required: ["viewport", "sampleSize", "mode", "overviewOnly", "representation", "detail", "image"], additionalProperties: false },
      }, required: ["viewport", "sampleSize", "mode", "overviewOnly", "representation", "detail", "image", "content", "contentBlocks", "structuredContent"], additionalProperties: false },
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_WRITE_TOOL = {
  name: CANVAS_WRITE_TOOL_NAME,
  title: "Write Canvas text",
  description: "Render text using the current Canvas text-rendering settings (auto, raw, ANSI, or Markdown), then write the resulting Cells at [x,y]. writeMode defaults to patch: ordinary whitespace is skipped so existing content is preserved; styled whitespace still writes. Use replace when whitespace must overwrite or clear a precise rectangle. canvas_read discloses the current rendering settings. Only rendered Cells are stored, not the input source. Unwritten positions remain unchanged. Existing backgrounds are preserved unless the renderer supplies a background. Returns writeMode, bounds, and Cell counts. Does not move the user's camera, cursor, or selection. Source-backed Canvases require source-file editing; Slide overflow is rejected without writing.",
  readOnly: false,
  inputSchema: {
    type: "object",
      properties: {
      canvasRef: { type: "string", minLength: 1, description: "Optional short runtime Canvas reference from manage(list). Omit to use the active Canvas." },
      canvasId: { type: "string", minLength: 1, description: "Legacy optional target Canvas UUID; prefer canvasRef." },
      at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "[x,y] in original Cell coordinates; signed safe integers." },
      content: { type: "string", description: "Text to render with the current settings; Markdown and ANSI work when enabled. Tabs and layout follow the shared text renderer. Do not copy read rulers, style notes, or sampled maps." },
      writeMode: { enum: ["patch", "replace"], default: "patch", description: "patch skips ordinary whitespace and preserves existing Cells; replace writes whitespace too." },
    },
    required: ["at", "content"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      { type: "object", properties: {
        canvasRef: { type: "string" }, canvasId: { type: "string" },
        writeMode: { enum: ["patch", "replace"] },
        bounds: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
        writtenCells: { type: "integer", minimum: 0 }, skippedWhitespaceCells: { type: "integer", minimum: 0 },
      }, required: ["writeMode", "bounds", "writtenCells", "skippedWhitespaceCells"], additionalProperties: false },
      { type: "object", properties: {
        ok: { const: false },
        code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied", "source_backed_canvas", "out_of_bounds", "write_failed"] },
        message: { type: "string" },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_CODE_TOOL = {
  name: CANVAS_CODE_TOOL_NAME,
  title: "Run Canvas code",
  description: "Run a bounded JavaScript composition against Canvas capabilities. The script receives ordinary-object APIs: await canvas.read(input), await canvas.search(input), await canvas.write({at, content, writeMode}), await canvas.manage({action}), await canvas.clipboard.readText() -> string, and await canvas.clipboard.writeText(text). Do not JSON.stringify inputs or JSON.parse results. preview is the default: writes render through the current Markdown/ANSI/theme pipeline and return a real rendered preview without mutation; apply commits all writes as one undoable operation. The sandbox has no DOM, network, filesystem, or arbitrary MCP access. Return a JSON-compatible value.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      script: { type: "string", minLength: 1, maxLength: 32768, description: "Bounded JavaScript using only the provided canvas capability API." },
      canvasRef: { type: "string", minLength: 1, description: "Optional short runtime Canvas reference from manage(list)." },
      mode: { enum: ["preview", "apply"], default: "preview", description: "preview renders writes without persisting them; apply commits them as one undoable operation." },
      timeoutMs: { type: "integer", minimum: 50, maximum: 10000, default: 2000 },
    },
    required: ["script"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      { type: "object", properties: {
        mode: { enum: ["preview", "apply"] }, result: {}, operations: { type: "integer", minimum: 0 },
        writes: { type: "integer", minimum: 0 }, durationMs: { type: "number", minimum: 0 }, truncated: { type: "boolean" },
      }, required: ["mode", "result", "operations", "writes", "durationMs", "truncated"], additionalProperties: false },
      { type: "object", properties: {
        ok: { const: false }, code: { type: "string" }, phase: { type: "string" }, retryable: { type: "boolean" },
        message: { type: "string" }, fallbackTools: { type: "array", items: { type: "string" } },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;
