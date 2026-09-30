# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

The MCP server runs as a local stdio process and forwards Canvas management, read,
search, and write calls over a loopback WebSocket to one explicitly paired
browser page. CharDesk can grant application-scoped access to all Canvases with
separate inspect, read, search, and write permissions; `canvasId` selects a
target without changing the human's active Canvas.
It does not store documents or relay Canvas content through a server.

Coding agents start it with:

```sh
npx -y @chardesk/mcp server
```

After the agent starts the server, print the private pairing URL with:

```sh
npx -y @chardesk/mcp pair
```

The browser can now connect through the fixed loopback bridge without exposing
the URL token: open **Agent → Local MCP → Pair** and choose Connect. The URL
form remains for legacy/manual pairing. Credentials are stored under the user
configuration directory and expire after 30 days. Revoke with:

```sh
npx -y @chardesk/mcp revoke
```

The server binds to `127.0.0.1:9494` by default. Set `CHARDESK_MCP_PORT` and
`CHARDESK_MCP_ORIGINS` when the local environment needs different values.
