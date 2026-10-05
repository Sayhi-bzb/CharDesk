import type { AgentToolDefinition } from "./contracts.ts";

import { localToolContracts, type LocalMcpToolContract } from "@chardesk/mcp/contracts";

const localContracts = new Map(localToolContracts.map((tool) => [tool.name, tool]));
const canonicalizeTool = <T extends { name: string }>(tool: T): T => {
  const contract: LocalMcpToolContract | undefined = localContracts.get(tool.name);
  if (!contract) throw new Error(`Missing local MCP contract for ${tool.name}`);
  return {
    ...tool,
    title: contract.title,
    description: contract.description,
    readOnly: contract.readOnly,
    inputSchema: contract.inputSchema,
  } as T;
};

export const CANVAS_READ_TOOL_NAME = "canvas_read";
export const CANVAS_WRITE_TOOL_NAME = "canvas_write";
export const CANVAS_ERASE_TOOL_NAME = "canvas_erase";
export const CANVAS_FILL_TOOL_NAME = "canvas_fill";
export const CANVAS_RENDER_TOOL_NAME = "canvas_render";
export const CANVAS_SEARCH_TOOL_NAME = "canvas_search";
export const CANVAS_MANAGE_TOOL_NAME = "canvas_manage";
export const CANVAS_CODE_TOOL_NAME = "canvas_code";

const CANVAS_SEARCH_TOOL_RAW = {
  name: CANVAS_SEARCH_TOOL_NAME,
  title: "Search Canvas text",
  description: "Search rendered Scene text at original Cell precision. Pass pageId for a specific Slide page; omit it for the active page. Literal and case-sensitive by default; regex enables RE2 syntax. Returns exact match origins, bounds, and matched content without surrounding context. Does not edit or move the camera.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 4096, description: "Literal text or RE2 patterns. Actual LF separates up to 64 aligned template rows; each row must contain non-whitespace text. No other control characters." },
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
      pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID. Omit for the active page or Freeform." },
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
        pageId: { type: "string" },
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

const CANVAS_MANAGE_TOOL_RAW = {
  name: CANVAS_MANAGE_TOOL_NAME,
  title: "Manage Canvases",
  description: "Manage Scene and Slide page lifecycle. Supports Scene list/create/duplicate/rename/archive and Slide page list/create/rename/duplicate/delete/reorder. Each Slide page has a stable pageId and name.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    action: { enum: ["list", "create", "duplicate", "rename", "archive", "list_pages", "create_page", "rename_page", "duplicate_page", "delete_page", "reorder_page"] },
    canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list)." },
    includeArchived: { type: "boolean", default: false, description: "Include archived Canvases in list results. Defaults to false." },
    name: { type: "string", minLength: 1 },
    pageId: { type: "string", minLength: 1, description: "Stable Slide page ID. Omit for Freeform Canvases." },
    afterPageId: { type: "string", minLength: 1 },
    index: { type: "integer", minimum: 0 },
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
    { type: "object", properties: { canvasId: { type: "string" }, pages: { type: "array", items: { type: "object", properties: { pageId: { type: "string" }, name: { type: "string" }, index: { type: "integer" }, size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, active: { type: "boolean" } }, required: ["pageId", "name", "index", "size", "active"], additionalProperties: false } } }, required: ["pages"], additionalProperties: false },
    { type: "object", properties: { canvasId: { type: "string" }, name: { type: "string" }, mode: { enum: ["freeform", "slide"] }, active: { type: "boolean" }, archived: { type: "boolean" } }, additionalProperties: false },
    { type: "object", properties: { canvasId: { type: "string" }, pageId: { type: "string" }, name: { type: "string" }, index: { type: "integer" }, size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, active: { type: "boolean" }, deleted: { type: "boolean" } }, additionalProperties: false },
    { type: "object", properties: { ok: { const: false }, code: { type: "string" }, message: { type: "string" } }, required: ["ok", "code", "message"], additionalProperties: false },
  ] },
} satisfies Omit<AgentToolDefinition, "execute">;

const CANVAS_READ_TOOL_RAW = {
  name: CANVAS_READ_TOOL_NAME,
  title: "Read Canvas viewport",
  description: "Read the current Scene as a coordinate-labelled Unicode map or an optional image block. Pass pageId for a specific Slide page; omit it for the active page. viewport is [x,y,width,height] in Cell coordinates. This reads the rendered Cell surface, not source files, and does not move the user's camera or edit the document.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
      pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID. Omit for the active page or Freeform." },
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
        pageId: { type: "string" },
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
          pageId: { type: "string" },
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

const CANVAS_WRITE_TOOL_RAW = {
  name: CANVAS_WRITE_TOOL_NAME,
  title: "Write Canvas stroke",
  description: "Write one continuous literal-Unicode stroke at [x,y] in the Projection layer. Pass pageId for a specific Slide page; omit it for the active page. Non-whitespace graphemes are written with one optional style and overwrite existing Cells; whitespace is transparent and does not erase. Use canvas_erase to remove Cells, canvas_fill to style existing characters, and canvas_render for Markdown/ANSI/material input. Source-backed Canvases require source-file editing; Slide overflow is rejected without writing.",
  readOnly: false,
  inputSchema: {
    type: "object",
      properties: {
      canvasId: { type: "string", minLength: 1, description: "Optional short persistent Canvas ID from manage(list). Omit to use the active Canvas." },
      pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID. Omit for the active page or Freeform." },
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
        pageId: { type: "string" },
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

const CANVAS_ERASE_TOOL_RAW = {
  name: CANVAS_ERASE_TOOL_NAME,
  title: "Erase Canvas region",
  description: "Erase Cells in a rectangular Projection region. Erasing is explicit; whitespace in canvas_write never clears existing content.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID." },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
  }, required: ["at", "size"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

const CANVAS_FILL_TOOL_RAW = {
  name: CANVAS_FILL_TOOL_NAME,
  title: "Style Canvas region",
  description: "Apply one style to existing characters in a rectangular Projection region without changing their characters. Empty cells remain empty.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID." },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    size: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    style: CANVAS_REGION_STYLE,
  }, required: ["at", "size", "style"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

const CANVAS_RENDER_TOOL_RAW = {
  name: CANVAS_RENDER_TOOL_NAME,
  title: "Render Canvas material",
  description: "Render Markdown, ANSI, or another supported material format with the current Canvas renderer, then place the resulting Projection Cells at [x,y]. Mutation results report persistence=saved|pending|failed|unavailable separately from the applied projection. Use canvas_write for literal Unicode strokes.",
  readOnly: false,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    pageId: { type: "string", minLength: 1, description: "Optional stable Slide page ID." },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    source: { type: "string" },
    format: { enum: ["auto", "raw", "ansi", "markdown"] },
  }, required: ["at", "source"], additionalProperties: false },
} satisfies Omit<AgentToolDefinition, "execute">;

const CANVAS_CODE_TOOL_RAW = {
  name: CANVAS_CODE_TOOL_NAME,
  title: "Run Canvas code",
  description: "Run a bounded JavaScript composition against Scene capabilities. The script receives ordinary-object APIs: canvas.read, canvas.search, canvas.write({at, pageId, content, style}), canvas.erase({at, pageId, size}), canvas.fill({at, pageId, size, style}), canvas.render({at, pageId, source, format}), canvas.manage, canvas.undo, and canvas.clipboard. Do not JSON.stringify inputs or JSON.parse results. preview is the default and does not mutate; apply commits projection edits as one undoable operation and returns an operationId. Mutation results include persistence=saved|pending|failed|unavailable; pending means the projection is applied while durability is still being retried. A single apply targets one Scene. The sandbox has no DOM, network, filesystem, or arbitrary MCP access. Return a JSON-compatible value.",
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

export const CANVAS_SEARCH_TOOL = canonicalizeTool(CANVAS_SEARCH_TOOL_RAW);
export const CANVAS_MANAGE_TOOL = canonicalizeTool(CANVAS_MANAGE_TOOL_RAW);
export const CANVAS_READ_TOOL = canonicalizeTool(CANVAS_READ_TOOL_RAW);
export const CANVAS_WRITE_TOOL = canonicalizeTool(CANVAS_WRITE_TOOL_RAW);
export const CANVAS_ERASE_TOOL = canonicalizeTool(CANVAS_ERASE_TOOL_RAW);
export const CANVAS_FILL_TOOL = canonicalizeTool(CANVAS_FILL_TOOL_RAW);
export const CANVAS_RENDER_TOOL = canonicalizeTool(CANVAS_RENDER_TOOL_RAW);
export const CANVAS_CODE_TOOL = canonicalizeTool(CANVAS_CODE_TOOL_RAW);
