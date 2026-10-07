const localToolContracts = [
  {
    name: 'canvas_code', title: 'Run Canvas code', readOnly: false,
    description: 'Run a bounded JavaScript composition against Scene capabilities. The script receives ordinary-object APIs: canvas.read, canvas.search, canvas.write({at, pageId, content, style}), canvas.erase({at, pageId, size}), canvas.fill({at, pageId, size, style}), canvas.render({at, pageId, source, format}), canvas.manage, canvas.undo, and clipboard. preview is the default and does not mutate; apply commits projection edits as one undoable operation. Mutation results include impact counts/bounds and persistence=saved|pending|failed|unavailable; pending means the projection is applied while durability is still being retried. No DOM, network, filesystem, or arbitrary MCP access.',
    inputSchema: { type: 'object', properties: {
      script: { type: 'string', minLength: 1, maxLength: 32768 },
      canvasId: { type: 'string', minLength: 1 },
      mode: { type: 'string', enum: ['preview', 'apply'], default: 'preview' },
      timeoutMs: { type: 'integer', minimum: 50, maximum: 10000, default: 2000 },
    }, required: ['script'], additionalProperties: false },
  },
  {
    name: 'canvas_erase', title: 'Erase Canvas region', readOnly: false,
    description: 'Erase a rectangular Projection region. Whitespace in canvas_write is transparent; use this tool to remove Cells explicitly. Results report actual cleared Cell counts/bounds and an operationId when the edit can be undone with canvas_undo.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }, canvasId: { type: 'string', minLength: 1 }, pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      size: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    }, required: ['at', 'size'], additionalProperties: false },
  },
  {
    name: 'canvas_fill', title: 'Style Canvas region', readOnly: false,
    description: 'Apply one style to existing characters in a rectangular Projection region without changing their characters. Results report styled Cell counts/bounds and an operationId when the edit can be undone with canvas_undo.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }, canvasId: { type: 'string', minLength: 1 }, pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      size: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }, style: { type: 'object' },
    }, required: ['at', 'size', 'style'], additionalProperties: false },
  },
  {
    name: 'canvas_undo', title: 'Undo Canvas operation', readOnly: false,
    description: 'Undo one latest Canvas mutation returned by a canvas_* tool or Canvas Code. Pass the returned operationId. Undo is scoped to the selected Canvas/page and is rejected when a later edit has already been made.',
    inputSchema: { type: 'object', properties: {
      operationId: { type: 'string', minLength: 1 }, canvasId: { type: 'string', minLength: 1 }, pageId: { type: 'string', minLength: 1 },
    }, required: ['operationId'], additionalProperties: false },
  },
  {
    name: 'canvas_render', title: 'Render Canvas material', readOnly: false,
    description: 'Render material with the current Canvas renderer and place the resulting Projection Cells. Provide source or sourceRef (a local file path); the local MCP reads sourceRef and forwards its text without requiring the agent to copy or rewrite it. Results report impact counts/bounds, persistence, and an operationId when the edit can be undone with canvas_undo. Use canvas_write for literal Unicode strokes.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }, canvasId: { type: 'string', minLength: 1 }, pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      source: { type: 'string', description: 'Material text. Mutually exclusive with sourceRef.' },
      sourceRef: { type: 'string', minLength: 1, description: 'Local file path whose UTF-8 text is rendered. Mutually exclusive with source.' },
      format: { type: 'string', enum: ['auto', 'raw', 'ansi', 'markdown'] },
    }, required: ['at'], additionalProperties: false },
  },
  {
    name: 'canvas_manage', title: 'Manage Canvases', readOnly: false,
    description: 'Manage Scene and Slide page lifecycle. Supports Scene list/create/duplicate/rename/archive and Slide page list/create/rename/duplicate/delete/reorder. Each Slide page has a stable pageId and name.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'create', 'duplicate', 'rename', 'archive', 'list_pages', 'create_page', 'rename_page', 'duplicate_page', 'delete_page', 'reorder_page'] },
      canvasId: { type: 'string', minLength: 1, description: 'Optional short persistent Canvas ID.' }, includeArchived: { type: 'boolean', default: false, description: 'Include archived Canvases in list results.' }, name: { type: 'string', minLength: 1 }, pageId: { type: 'string', minLength: 1 }, afterPageId: { type: 'string', minLength: 1 }, index: { type: 'integer', minimum: 0 },
      mode: { type: 'string', enum: ['freeform', 'slide'] },
    }, required: ['action'], additionalProperties: false },
  },
  {
    name: 'canvas_read', title: 'Read Canvas viewport', readOnly: true,
    description: 'Read the rendered Scene surface as a coordinate-labelled Unicode map or optional image block. The exact-text camera is 100×40 Cells: sampleSize=1 and mode=text return exact Unicode; sampleSize>1 is navigation-only projection/density, and the returned next boundary tells the Agent which smaller viewport to read next. Omit canvasId to use the active Scene; pass pageId for a specific Slide page. viewport is [x,y,width,height] in Cell coordinates; an omitted viewport reads the current overview. Default text is lightweight and omits style notes. This does not edit the document.',
    inputSchema: { type: 'object', properties: {
      canvasId: { type: 'string', minLength: 1, description: 'Optional short persistent Canvas ID.' },
      pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      representation: { type: 'string', enum: ['text', 'cells', 'image', 'both'], default: 'text', description: 'text is human-readable; cells returns exact structured Projection Cells; image is for visual layout/color; both returns text and image.' },
      style: { type: 'string', enum: ['none', 'appearance'], default: 'none', description: 'none keeps text lightweight; appearance returns merged spatial style regions and renderer context. cells always includes exact Cell styles.' },
      detail: { type: 'string', enum: ['low', 'high', 'original', 'auto'], default: 'auto', description: 'Image rendering detail. Ignored for text and defaults to auto.' },
    }, additionalProperties: false },
  },
  {
    name: 'canvas_search', title: 'Search Canvas text', readOnly: true,
    description: 'Search rendered Scene text at Cell precision. Pass pageId for a specific Slide page. Literal and case-sensitive matching is the default; regex, ignoreCase, viewport, and continuation are supported. Results contain exact match origins, bounds, and content without surrounding context.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', minLength: 1, maxLength: 4096 },
      canvasId: { type: 'string', minLength: 1, description: 'Optional short persistent Canvas ID.' },
      pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      regex: { type: 'boolean', default: false }, ignoreCase: { type: 'boolean', default: false },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      after: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'canvas_write', title: 'Write Canvas text', readOnly: false,
    description: 'Write one continuous literal-Unicode stroke at [x,y] in the Projection layer. Pass pageId for a specific Slide page. Provide content or sourceRef (a local file path); the local MCP reads sourceRef and forwards its text without requiring the agent to copy or rewrite it. Non-whitespace graphemes overwrite existing Cells with one optional style; whitespace is transparent and never erases. Results report impact counts/bounds, persistence, and an operationId when the edit can be undone with canvas_undo. Use canvas_erase to remove Cells, canvas_fill to style existing characters, and canvas_render for material input.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
      canvasId: { type: 'string', minLength: 1, description: 'Optional short persistent Canvas ID.' },
      pageId: { type: 'string', minLength: 1, description: 'Optional stable Slide page ID.' },
      content: { type: 'string', description: 'Literal Unicode text. Mutually exclusive with sourceRef.' },
      sourceRef: { type: 'string', minLength: 1, description: 'Local file path whose UTF-8 text is used as the stroke. Mutually exclusive with content.' },
      style: { type: 'object' },
    }, required: ['at'], additionalProperties: false },
  },
];

// Exported separately so browser hosts can consume the exact same names,
// descriptions, and input schemas without importing the MCP runtime.
export { localToolContracts };

export const tools = localToolContracts.map(({ readOnly, ...tool }) => ({
  ...tool,
  annotations: { readOnlyHint: readOnly },
}));

export const toolNames = new Set(tools.map(({ name }) => name));
