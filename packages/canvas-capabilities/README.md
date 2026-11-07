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
