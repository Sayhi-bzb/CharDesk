# Canvas capabilities

Transport-neutral Canvas contracts and execution helpers for browser and local hosts.
Only `@chardesk/canvas-capabilities/contracts` is a published consumer interface;
execution modules are workspace source bundled into their hosts.

`src/contracts.mjs` owns tool names, descriptions and input schemas. The MCP package
re-exports that contract for existing clients. `createCanvasCapabilities(host)` dispatches
host-provided tools; `projection`, `readViewport`, `textRegion` and `code` own shared
Unicode stroke preparation, coordinate reads and bounded QuickJS execution.

Hosts supply lifecycle, rendering, persistence and clipboard implementations. The
browser adapters remain under `app/site-tools`; the Bun adapter lives in local-runtime.
Unsupported host capabilities return `unsupported_capability`.

[`read.ts`](src/read.ts) owns `canvas_read` validation, text/Cells/appearance,
image fallback and the transport-neutral result. It captures the target before
awaiting Host IO. [`readImage.ts`](src/readImage.ts) owns viewport clipping,
detail and message budgets, and paints through the shared
[`rendering` Cell painter](../rendering/src/canvas.ts).

Web MCP/WebMCP and local CLI/MCP call that same read pipeline. Hosts only resolve
the target and appearance, load fonts and encode PNG:
[browser](../../apps/canvas/src/app/site-tools/canvasReadImage.ts),
[native](../local-runtime/src/readImage.ts).
Image bytes occur in `contentBlocks`; `structuredContent` contains read metadata.
PNG export remains a file delivery workflow, independent of agent read budgets.

Verification: [shared contracts and bounds](../../apps/canvas/src/app/site-tools/canvasRead.test.ts),
[browser and WebMCP](../../apps/canvas/src/app/site-tools/canvasReadImage.dom.test.ts),
[offline/live PNG pixels](../../examples/terminal-canvas/src/localCapabilities.test.ts),
[MCP transport](../mcp/test/server.test.mjs).
