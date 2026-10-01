# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

The MCP server runs as a local stdio process and forwards Canvas management, read,
search, and write calls over a loopback WebSocket to one explicitly paired
browser page. Multiple MCP processes can share that page: the first process owns
the broker and later processes register as isolated tenant sessions. CharDesk can
grant application-scoped access to all Canvases with separate inspect, read,
search, and write permissions; `canvasRef` selects a target without changing
the human's active Canvas. Get refs from `chardesk_canvas_manage` with the
`list` action; the legacy `canvasId` UUID input remains supported.
The manage list action omits archived Canvases by default; pass
`includeArchived: true` only when archived pages are explicitly needed. It does
not store documents or relay Canvas content through a server.

Coding agents start it with:

```sh
npx -y @chardesk/mcp server
```

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

Canvas reads default to exact text. Agents may choose an image block for visual
inspection, or both when comparison is necessary:

```json
{ "representation": "text" }
{ "representation": "image", "detail": "low" }
{ "representation": "both" }
```

Text remains authoritative for Unicode and Cell coordinates. The MCP bridge exposes
visual blocks through standard `content[]` and machine-readable read metadata through
`structuredContent`.

Canvas writes default to `writeMode: "patch"`: ordinary whitespace is skipped so
existing content is preserved. Use `writeMode: "replace"` when whitespace must
overwrite or clear a precise rectangle; styled whitespace remains writable in
patch mode.
