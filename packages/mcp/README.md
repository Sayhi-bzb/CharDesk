# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

The MCP server runs as a local stdio process and forwards Canvas read, search,
and write calls over a loopback WebSocket to one explicitly paired browser page.
It does not store documents or relay Canvas content through a server.

Coding agents start it with:

```sh
npx -y @chardesk/mcp server
```

After the agent starts the server, print the private pairing URL with:

```sh
npx -y @chardesk/mcp pair
```

Paste that URL in Canvas: **Agent → Local MCP → Pair**. Credentials are stored
under the user configuration directory and expire after 30 days. Revoke with:

```sh
npx -y @chardesk/mcp revoke
```

The server binds to `127.0.0.1:9494` by default. Set `CHARDESK_MCP_PORT` and
`CHARDESK_MCP_ORIGINS` when the local environment needs different values.
