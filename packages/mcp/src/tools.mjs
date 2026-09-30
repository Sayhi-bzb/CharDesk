export const tools = [
  {
    name: 'chardesk_canvas_list', title: 'List Canvases', readOnly: true,
    description: 'List all Canvases visible to this CharDesk instance.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_read', title: 'Read Canvas viewport', readOnly: true,
    description: 'Read the rendered Canvas surface as a coordinate-labelled Unicode map. viewport is [x,y,width,height] in Cell coordinates; an omitted viewport reads the current Canvas overview. This does not edit the document.',
    inputSchema: { type: 'object', properties: {
      canvasId: { type: 'string', minLength: 1 },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
    }, additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_search', title: 'Search Canvas text', readOnly: true,
    description: 'Search rendered Canvas text at Cell precision. Literal and case-sensitive matching is the default; regex, ignoreCase, viewport, and continuation are supported.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', minLength: 1, maxLength: 4096 },
      canvasId: { type: 'string', minLength: 1 },
      regex: { type: 'boolean', default: false }, ignoreCase: { type: 'boolean', default: false },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      after: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_write', title: 'Write Canvas text', readOnly: false,
    description: 'Write text at [x,y] in original Cell coordinates. The connected Canvas applies its current rendering settings; source-backed Canvases may reject writes.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
      canvasId: { type: 'string', minLength: 1 },
      content: { type: 'string' },
    }, required: ['at', 'content'], additionalProperties: false },
  },
].map(({ readOnly, ...tool }) => ({ ...tool, annotations: { readOnlyHint: readOnly } }));

export const toolNames = new Set(tools.map(({ name }) => name));
