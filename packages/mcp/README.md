# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

The MCP server runs as a local stdio process and forwards Canvas management, read,
search, and write calls over a loopback WebSocket to one explicitly paired
browser page. Multiple MCP processes can share that page: the first process owns
the broker and later processes register as isolated tenant sessions. CharDesk can
grant application-scoped access to all Canvases with separate inspect, read,
search, and write permissions; the short persistent `canvasId` selects a target
without changing the human's active Canvas. Get IDs from
`chardesk_canvas_manage` with the `list` action.
The manage list action omits archived Canvases by default; pass
`includeArchived: true` only when archived pages are explicitly needed. It does
not store documents or relay Canvas content through a server.

Coding agents start it with:

```sh
npx -y @chardesk/mcp server
```

For local MCP development, use the watcher from the repository root:

```sh
npm run dev:mcp
```

This restarts the local Node bridge when `packages/mcp/src` changes. It is a
development command; normal agent configuration should continue to use the
stable `server` command.

After the agent starts the server, print the private pairing URL with:

```sh
npx -y @chardesk/mcp pair
```

When another coding agent starts `server` on the same machine, it detects the
existing broker and joins it as a tenant automatically. Tenant requests use
independent session tokens and are serialized through the shared browser page.

The browser can now connect through the fixed loopback bridge without exposing
the URL token: open **Agent → Local MCP** and turn on the connection switch. The
URL form remains available to legacy/manual clients. Credentials are stored under the user
configuration directory and expire after 30 days. Revoke with:

```sh
npx -y @chardesk/mcp revoke
```

The server binds to `127.0.0.1:9494` by default. Set `CHARDESK_MCP_PORT` and
`CHARDESK_MCP_ORIGINS` when the local environment needs different values.
The broker remains alive after the owner agent's stdio closes while the browser
page or another tenant is connected. Set `CHARDESK_MCP_DEBUG=1` to emit JSON
lifecycle events (`browser_connected`, `tenant_connected`, `owner_stdio_closed`,
`tenant_closed`, and `browser_closed`) to stderr when diagnosing disconnects.

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

Canvas editing is split into Projection operations: `chardesk_canvas_write` draws
one literal-Unicode stroke with one optional style; whitespace is transparent.
It accepts either `content` or `sourceRef`. `sourceRef` is a local file path;
the local MCP reads the UTF-8 file and forwards the result as the stroke, so an
agent can send script output without copying it into a tool argument.
`chardesk_canvas_erase` clears a rectangle, `chardesk_canvas_fill` styles existing
characters, and `chardesk_canvas_render` converts material such as Markdown or
ANSI into Projection Cells. `render` accepts either `source` or `sourceRef` using
the same local-file rule.
