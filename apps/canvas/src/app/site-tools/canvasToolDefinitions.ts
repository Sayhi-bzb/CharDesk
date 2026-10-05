import type { AgentToolDefinition } from "./contracts.ts";

export const CANVAS_READ_TOOL_NAME = "chardesk_canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "chardesk_canvas_write";
export const CANVAS_ERASE_TOOL_NAME = "chardesk_canvas_erase";
export const CANVAS_FILL_TOOL_NAME = "chardesk_canvas_fill";
export const CANVAS_RENDER_TOOL_NAME = "chardesk_canvas_render";
export const CANVAS_SEARCH_TOOL_NAME = "chardesk_canvas_search";
export const CANVAS_MANAGE_TOOL_NAME = "chardesk_canvas_manage";
export const CANVAS_CODE_TOOL_NAME = "chardesk_canvas_code";

export const CANVAS_SEARCH_TOOL = {
  name: CANVAS_SEARCH_TOOL_NAME,
  title: "Search Canvas text",
  description: "Search rendered Canvas text at original Cell precision. Literal and case-sensitive by default; regex enables RE2 syntax (no lookaround/backreferences), ignoreCase enables Unicode case folding. Actual LF separates a spatial template: each non-blank row must match at the same x on consecutive Canvas rows; widths may differ. Each row consumes complete graphemes and non-empty text; zero-length regex matches are skipped. Regex ^/$ refer to the finite stored row envelope clipped by viewport, not template origin or arbitrary storage spans. Missing spaces inside that envelope participate; regex envelopes over 16384 Cells and budget exhaustion return search_limit, never partial results. Narrow viewport to retry. Returns up to 20 non-overlapping matches in y/x order; each match includes exact origin, bounds, and matched content without surrounding context. Continue with next as after using identical query, regex, ignoreCase, viewport and canvasId. Calls are live, not a snapshot. Does not edit or move the camera.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 4096, description: "Literal text or RE2 patterns. Actual LF separates up to 64 aligned template rows; each row must contain non-whitespace text. No other control characters." },
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
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
  description: "Manage Canvas lifecycle state. Supports list, create, rename, and archive. The list action returns active Canvases by default; pass includeArchived=true to include archived Canvases. Each Canvas has a short persistent canvasId. Omit it to use the active Canvas.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    action: { enum: ["list", "create", "rename", "archive"] },
    canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list)." },
    includeArchived: { type: "boolean", default: false, description: "Include archived Canvases in list results. Defaults to false." },
    name: { type: "string", minLength: 1 },
    mode: { enum: ["freeform", "slide"] },
  }, required: ["action"], additionalProperties: false },
  outputSchema: { type: "object", oneOf: [
    { type: "object", properties: {
      currentCanvasId: { anyOf: [{ type: "string" }, { type: "null" }] },
      currentCanvas: { anyOf: [{ type: "object", properties: {
        canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] },
        active: { type: "boolean" }, archived: { type: "boolean" }, editable: { type: "boolean" },
      }, required: ["canvasId", "name", "mode", "active", "archived", "editable"], additionalProperties: false }, { type: "null" }] },
      canvases: { type: "array", items: { type: "object", properties: {
        canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] },
        active: { type: "boolean" }, archived: { type: "boolean" }, editable: { type: "boolean" },
      }, required: ["canvasId", "name", "mode", "active", "archived", "editable"], additionalProperties: false } },
    }, required: ["currentCanvasId", "currentCanvas", "canvases"], additionalProperties: false },
    { type: "object", properties: { canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] }, active: { type: "boolean" }, archived: { type: "boolean" } }, additionalProperties: false },
    { type: "object", properties: { ok: { const: false }, code: { type: "string" }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
  ] },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_READ_TOOL = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Canvas as a coordinate-labelled Unicode map or an optional image block. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview of all content. Default text is lightweight and omits style notes; pass style=appearance for a continuous spatial appearance map. Use representation=cells for exact Cell characters and styles, image for visual layout/color, or both for explicit comparison. When overviewOnly is true, content is sampled navigation data, not source text; narrow the viewport or use search before describing characters. Move or resize the rectangle to pan or zoom. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
      viewport: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4, description: "[x,y,width,height]; signed coordinates, positive sizes." },
      representation: { enum: ["text", "cells", "image", "both"], default: "text", description: "Read representation. text is human-readable; cells returns exact structured Projection Cells; image is for visual layout/color; both returns text and image." },
      style: { enum: ["none", "appearance"], default: "none", description: "Style output. none keeps text lightweight; appearance returns merged spatial style regions and renderer context. cells always includes exact Cell styles." },
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
        sampleSize: { type: "integer", minimum: 1 },
        mode: { enum: ["text", "projection", "density"] },
        overviewOnly: { type: "boolean", description: "True when content is sampled projection/density navigation data and must not be treated as source text." },
        representation: { enum: ["text", "cells", "image", "both"] },
        style: { enum: ["none", "appearance"] },
        detail: { enum: ["low", "high", "original", "auto"] },
        appearance: { anyOf: [{ type: "object", properties: {
          theme: { enum: ["light", "dark"] },
          regions: { type: "array", items: { type: "object", properties: {
            bounds: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, style: { type: "object" },
          }, required: ["bounds", "style"], additionalProperties: false } },
        }, required: ["theme", "regions"], additionalProperties: false }, { type: "null" }] },
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
          canvasId: { type: "string" }, viewport: { anyOf: [{ type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 }, { type: "null" }] },
          sampleSize: { type: "integer", minimum: 1 }, mode: { enum: ["text", "projection", "density"] }, overviewOnly: { type: "boolean" },
          representation: { enum: ["text", "cells", "image", "both"] }, style: { enum: ["none", "appearance"] }, detail: { enum: ["low", "high", "original", "auto"] },
          cells: { type: "array", items: { type: "object" } },
          appearance: { anyOf: [{ type: "object" }, { type: "null" }] },
          image: { anyOf: [{ type: "object" }, { type: "null" }] },
        }, required: ["viewport", "sampleSize", "mode", "overviewOnly", "representation", "style", "detail", "image", "appearance"], additionalProperties: false },
      }, required: ["viewport", "sampleSize", "mode", "overviewOnly", "representation", "style", "detail", "image", "appearance", "content", "contentBlocks", "structuredContent"], additionalProperties: false },
      { type: "object", properties: { ok: { const: false }, code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied"] }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_WRITE_TOOL = {
  name: CANVAS_WRITE_TOOL_NAME,
  title: "Write Canvas stroke",
  description: "Write one continuous literal-Unicode stroke at [x,y] in the Projection layer. Non-whitespace graphemes are written with one optional style and overwrite existing Cells; whitespace is transparent and does not erase. Use chardesk_canvas_erase to remove Cells, chardesk_canvas_fill to style existing characters, and chardesk_canvas_render for Markdown/ANSI/material input. Source-backed Canvases require source-file editing; Slide overflow is rejected without writing.",
  readOnly: false,
  inputSchema: {
    type: "object",
      properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
      at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2, description: "[x,y] in original Cell coordinates; signed safe integers." },
      content: { type: "string", description: "Literal Unicode text. Markdown, ANSI, and other material syntax are not parsed by this operation." },
      style: { type: "object", properties: { color: { type: "string" }, bgColor: { type: "string" }, href: { type: "string" }, attrs: { type: "object", properties: { bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" }, strike: { type: "boolean" }, inverse: { type: "boolean" } }, additionalProperties: false } }, additionalProperties: false },
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
        writtenCells: { type: "integer", minimum: 0 },
        persisted: { type: "boolean" },
        persistence: { enum: ["saved", "pending", "failed", "unavailable"] },
        persistenceError: { type: "string" },
      }, required: ["bounds", "writtenCells"], additionalProperties: false },
      { type: "object", properties: {
        ok: { const: false },
        code: { enum: ["invalid_input", "canvas_not_active", "canvas_not_found", "canvas_not_ready", "permission_denied", "source_backed_canvas", "out_of_bounds", "write_failed"] },
        message: { type: "string" },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;

const CANVAS_REGION_STYLE = { type: "object", properties: {
  color: { type: "string" }, bgColor: { type: "string" }, href: { type: "string" },
  attrs: { type: "object", properties: { bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" }, strike: { type: "boolean" }, inverse: { type: "boolean" } }, additionalProperties: false },
}, additionalProperties: false };

export const CANVAS_ERASE_TOOL = {
  name: CANVAS_ERASE_TOOL_NAME,
  title: "Erase Canvas region",
  description: "Erase Cells in a rectangular Projection region. Erasing is explicit; whitespace in canvas_write never clears existing content.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
  }, required: ["at", "size"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_FILL_TOOL = {
  name: CANVAS_FILL_TOOL_NAME,
  title: "Style Canvas region",
  description: "Apply one style to existing characters in a rectangular Projection region without changing their characters. Empty cells remain empty.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    style: CANVAS_REGION_STYLE,
  }, required: ["at", "size", "style"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_RENDER_TOOL = {
  name: CANVAS_RENDER_TOOL_NAME,
  title: "Render Canvas material",
  description: "Render Markdown, ANSI, or another supported material format with the current Canvas renderer, then place the resulting Projection Cells at [x,y]. Mutation results report persistence=saved|pending|failed|unavailable separately from the applied projection. Use canvas_write for literal Unicode strokes.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    source: { type: "string" },
    format: { enum: ["auto", "raw", "ansi", "markdown"] },
  }, required: ["at", "source"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

export const CANVAS_CODE_TOOL = {
  name: CANVAS_CODE_TOOL_NAME,
  title: "Run Canvas code",
  description: "Run a bounded JavaScript composition against Canvas capabilities. The script receives ordinary-object APIs: canvas.read, canvas.search, canvas.write({at, content, style}), canvas.erase({at, size}), canvas.fill({at, size, style}), canvas.render({at, source, format}), canvas.manage, canvas.undo, and canvas.clipboard. Do not JSON.stringify inputs or JSON.parse results. preview is the default and does not mutate; apply commits projection edits as one undoable operation and returns an operationId. Mutation results include persistence=saved|pending|failed|unavailable; pending means the projection is applied while durability is still being retried. A single apply targets one Canvas. The sandbox has no DOM, network, filesystem, or arbitrary MCP access. Return a JSON-compatible value.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      script: { type: "string", minLength: 1, maxLength: 32768, description: "Bounded JavaScript using only the provided canvas capability API." },
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list)." },
        mode: { enum: ["preview", "apply"], default: "preview", description: "preview renders writes without persisting them; apply commits them as one undoable operation." },
      timeoutMs: { type: "integer", minimum: 50, maximum: 10000, default: 2000, description: "Script and Canvas capability budget. QuickJS runtime warmup is handled separately." },
    },
    required: ["script"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      { type: "object", properties: {
        mode: { enum: ["preview", "apply"] }, result: {}, operationId: { type: "string" }, operations: { type: "integer", minimum: 0 },
        writes: { type: "integer", minimum: 0 }, persistence: { enum: ["saved", "pending", "failed", "unavailable"] }, durationMs: { type: "number", minimum: 0 }, truncated: { type: "boolean" },
      }, required: ["mode", "result", "operations", "writes", "durationMs", "truncated"], additionalProperties: false },
      { type: "object", properties: {
        ok: { const: false }, code: { type: "string" }, phase: { type: "string" }, retryable: { type: "boolean" },
        message: { type: "string" }, fallbackTools: { type: "array", items: { type: "string" } },
      }, required: ["ok", "code", "message"], additionalProperties: false },
    ],
  },
} satisfies Omit<AgentToolDefinition, "execute">;
