export const tools = [
  {
    name: 'chardesk_canvas_read', title: 'Read Canvas viewport', readOnly: true,
    description: 'Read the current Canvas as a coordinate-labelled Unicode map. viewport is [x,y,width,height] in Cell coordinates. Omit it for an overview. This reads the rendered Cell surface and does not edit the document.',
    inputSchema: { type: 'object', properties: { viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 } }, additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_search', title: 'Search Canvas text', readOnly: true,
    description: 'Search rendered Canvas text at Cell precision. Literal and case-sensitive by default; regex and ignoreCase are optional. Continue with next using the same options.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', minLength: 1, maxLength: 4096 },
      regex: { type: 'boolean', default: false }, ignoreCase: { type: 'boolean', default: false },
      viewport: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
      after: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'chardesk_canvas_write', title: 'Write Canvas text', readOnly: false,
    description: 'Write text at [x,y] in original Cell coordinates. The connected Canvas applies its current rendering settings. Source-backed Canvases remain read-only.',
    inputSchema: { type: 'object', properties: {
      at: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
      content: { type: 'string' },
    }, required: ['at', 'content'], additionalProperties: false },
  },
].map(({ readOnly, ...tool }) => ({ ...tool, annotations: { readOnlyHint: readOnly } }));

export const toolNames = new Set(tools.map(({ name }) => name));
