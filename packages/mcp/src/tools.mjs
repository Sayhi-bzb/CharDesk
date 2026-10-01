export const tools = [
  {
    name: 'chardesk_canvas_manage', title: 'Manage Canvases', readOnly: false,
    description: 'Manage Canvas lifecycle state with list, create, rename, and archive actions. list returns active Canvases by default; set includeArchived=true to include archived Canvases. It returns short runtime canvasRef handles; use one for explicit cross-Canvas work.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'create', 'rename', 'archive'] },
      canvasRef: { type: 'string', minLength: 1 }, canvasId: { type: 'string', minLength: 1, description: 'Legacy Canvas UUID; prefer canvasRef.' }, includeArchived: { type: 'boolean', default: false, description: 'Include archived Canvases in list results.' }, name: { type: 'string', minLength: 1 },
      mode: { type: 'string', enum: ['freeform', 'slide'] },
    }, required: ['action'], additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_read', title: 'Read Canvas viewport', readOnly: true,
    description: 'Read the rendered Canvas surface as a coordinate-labelled Unicode map or optional image block. Omit canvasRef to use the active Canvas; get short refs from manage(list). viewport is [x,y,width,height] in Cell coordinates; an omitted viewport reads the current Canvas overview. Default representation is text and is authoritative for exact Unicode and Cell coordinates. Choose image for layout/color or both for explicit comparison; both increases context. detail only affects image rendering and defaults to auto. This does not edit the document.',
    inputSchema: { type: 'object', properties: {
      canvasRef: { type: 'string', minLength: 1 }, canvasId: { type: 'string', minLength: 1, description: 'Legacy Canvas UUID; prefer canvasRef.' },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      representation: { type: 'string', enum: ['text', 'image', 'both'], default: 'text', description: 'text preserves exact Unicode/coordinates; image is for visual layout/color; both returns both.' },
      detail: { type: 'string', enum: ['low', 'high', 'original', 'auto'], default: 'auto', description: 'Image rendering detail. Ignored for text and defaults to auto.' },
    }, additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_search', title: 'Search Canvas text', readOnly: true,
    description: 'Search rendered Canvas text at Cell precision. Literal and case-sensitive matching is the default; regex, ignoreCase, viewport, and continuation are supported. Results contain exact match origins, bounds, and content without surrounding context.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', minLength: 1, maxLength: 4096 },
      canvasRef: { type: 'string', minLength: 1 }, canvasId: { type: 'string', minLength: 1, description: 'Legacy Canvas UUID; prefer canvasRef.' },
      regex: { type: 'boolean', default: false }, ignoreCase: { type: 'boolean', default: false },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      after: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_write', title: 'Write Canvas text', readOnly: false,
    description: 'Write text at [x,y] in original Cell coordinates. writeMode defaults to patch: ordinary whitespace is skipped so existing content is preserved; styled whitespace still writes. Use replace when whitespace must overwrite or clear a precise rectangle. The connected Canvas applies its current rendering settings; source-backed Canvases may reject writes.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
      canvasRef: { type: 'string', minLength: 1 }, canvasId: { type: 'string', minLength: 1, description: 'Legacy Canvas UUID; prefer canvasRef.' },
      writeMode: { type: 'string', enum: ['patch', 'replace'], default: 'patch', description: 'patch skips ordinary whitespace; replace writes whitespace too.' },
      content: { type: 'string' },
    }, required: ['at', 'content'], additionalProperties: false },
  },
].map(({ readOnly, ...tool }) => ({ ...tool, annotations: { readOnlyHint: readOnly } }));

export const toolNames = new Set(tools.map(({ name }) => name));
