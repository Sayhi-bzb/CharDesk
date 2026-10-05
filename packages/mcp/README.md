# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

## Contract ownership

`src/tools.mjs` is the canonical Canvas tool contract. It is exported as
`@chardesk/mcp/contracts` for browser hosts, which may attach an execution
adapter and richer output schemas without redefining names, descriptions, or
input schemas. `sourceRef` is a local-bridge extension resolved by this package
before forwarding; browser hosts do not read local file paths.

The MCP server runs as a local stdio process and forwards Canvas management, read,
search, and write calls over a loopback WebSocket to one explicitly paired
browser page. Multiple MCP processes can share that page as independent clients;
the bridge only multiplexes request IDs and does not create agent sessions.
CharDesk can grant application-scoped access to all Canvases with separate
inspect, read, search, and write permissions; the short persistent `canvasId` selects a target
without changing the human's active Canvas. Get IDs from
`canvas_manage` with the `list` action.
The manage list action omits archived Canvases by default; pass
`includeArchived: true` only when archived pages are explicitly needed. It does
not store documents or relay Canvas content through a server.

Coding agents start it automatically when configured with:

```sh
npx -y @chardesk/mcp
```

The browser Canvas discovers the local bridge automatically when it is open.
There is no manual pairing step in the normal workflow.
If a Canvas tool is called before a page is open, the broker opens the default
Canvas URL once and returns a retryable connection message. Set
`CHARDESK_CANVAS_URL` to use another Canvas URL, or
`CHARDESK_MCP_OPEN_CANVAS=0` to disable automatic opening.

For local MCP development, use the watcher from the repository root:

```sh
npm run dev:mcp
```

This restarts the local Node bridge when `packages/mcp/src` changes. It is a
development command; normal agent configuration should continue to use the
stable `server` command.

Advanced clients can print the private pairing URL with:

```sh
npx -y @chardesk/mcp pair
```

When another coding agent starts `server` on the same machine, it detects the
existing bridge and joins it as a client automatically. Client requests are
matched by request ID and forwarded through the shared browser page.

The browser connects through the fixed loopback bridge without exposing the URL
token. **Agent → Local MCP** is a status and permission panel; the URL form
remains available to legacy/manual clients. Credentials are stored under the
user configuration directory and expire after 30 days. Revoke with:

```sh
npx -y @chardesk/mcp revoke
```

The server binds to `127.0.0.1:9494` by default. Set `CHARDESK_MCP_PORT` and
`CHARDESK_MCP_ORIGINS` when the local environment needs different values.
The bridge remains alive after the owner agent's stdio closes while the browser
page or another client is connected. Set `CHARDESK_MCP_DEBUG=1` to emit JSON
lifecycle events (`browser_connected`, `browser_ready`, `client_connected`,
`owner_stdio_closed`, `client_closed`, and `browser_closed`) to stderr when
diagnosing disconnects. `GET http://127.0.0.1:9494/health` reports the current
bridge, page, and client state.

Canvas reads default to lightweight exact text without style notes. Agents may
request a spatial appearance map, exact Cell records, an image block for visual
inspection, or both when comparison is necessary:

```json
{ "representation": "text" }
{ "representation": "text", "style": "appearance" }
{ "representation": "cells" }
{ "representation": "image", "detail": "low" }
{ "representation": "both" }
```

Text remains authoritative for Unicode and Cell coordinates. The MCP bridge exposes
visual blocks through standard `content[]` and machine-readable read metadata through
`structuredContent`.

Canvas management also exposes Slide pages through `canvas_manage`:
use `list_pages` to discover stable `pageId` and `name` values, then pass
`pageId` to content tools without changing the user's active page.

Canvas editing is split into Projection operations: `canvas_write` draws
one literal-Unicode stroke with one optional style; whitespace is transparent.
It accepts either `content` or `sourceRef`. `sourceRef` is a local file path;
the local MCP reads the UTF-8 file and forwards the result as the stroke, so an
agent can send script output without copying it into a tool argument.
`canvas_erase` clears a rectangle, `canvas_fill` styles existing characters, and
`canvas_render` converts material such as Markdown or
ANSI into Projection Cells. `render` accepts either `source` or `sourceRef` using
the same local-file rule.
