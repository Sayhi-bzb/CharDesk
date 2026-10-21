# @chardesk/mcp

Local MCP bridge for a CharDesk Canvas.

## Contract ownership

`src/tools.mjs` is the canonical Canvas tool contract. It is exported as
`@chardesk/mcp/contracts` for browser hosts, which may attach an execution
adapter and richer output schemas without redefining names, descriptions, or
input schemas. `sourceRef` is a local-bridge extension resolved by this package
before forwarding; browser hosts do not read local file paths.

Each Agent runs a stdio adapter. Adapters send authenticated, bounded HTTP calls
to an independent local bridge; only the bridge maintains a WebSocket to the
paired browser page. Idle adapters hold no bridge connections or session slots.
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

The MCP server reports the installed package version during the MCP handshake.
It performs a cached, non-blocking npm check once per day and writes an update
notice to stderr when a newer release is available. Refresh explicitly with:

```sh
npx -y @chardesk/mcp@latest
```

Set `CHARDESK_MCP_UPDATE_CHECK=0` to disable the check. Network failures are
silent and never block Canvas tool calls.

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

Stop an existing bridge first with `npx -y @chardesk/mcp bridge stop`.
The watcher runs the bridge in the foreground; Agent adapters join it normally.

Advanced clients can print the private pairing URL with:

```sh
npx -y @chardesk/mcp pair
```

Adapters automatically start or reuse the bridge. Concurrent starts elect the
bridge by binding the configured port; only the winner writes credentials and
connection metadata. Startup is bounded to five seconds. The bridge does not
belong to whichever Agent started first.

The browser connects through the fixed loopback bridge without exposing the URL
token. **Agent → Local MCP** is a status and permission panel; the URL form
remains available to legacy/manual clients. Credentials are stored under the
user configuration directory and expire after 30 days. Revoke with:

```sh
npx -y @chardesk/mcp revoke
```

The server binds to `127.0.0.1:9494` by default. Set `CHARDESK_MCP_PORT` and
`CHARDESK_MCP_ORIGINS` when the local environment needs different values.
Adapters cancel their requests and exit within one second when stdio ends.
The bridge remains alive while the page is connected or requests are running;
otherwise it exits after 30 seconds. An existing adapter can start a replacement
bridge before its next call. Port `0` is for isolated tests with a private
connection-metadata directory; shared startup uses a fixed port.

The bridge allows 128 concurrent requests globally and 32 per caller. Completed,
cancelled, disconnected, and timed-out requests release their budget. Ordinary
calls time out after 10 seconds; `canvas_code` after 30 seconds. Writes are never
automatically replayed: a disconnect or timeout after dispatch reports
`execution_unknown`, so inspect the Canvas before retrying.

```sh
npx -y @chardesk/mcp bridge status
npx -y @chardesk/mcp bridge stop
```

`GET http://127.0.0.1:9494/health` reports the bridge protocol/package versions,
instance, page readiness, active requests/callers, and request budgets; it does
not enumerate idle Agents. Set `CHARDESK_MCP_DEBUG=1` for structured lifecycle
events in the private `<pairing-file>.log`. The default metadata file is
`pairing.json` beside the credentials; `CHARDESK_MCP_PAIRING` and
`CHARDESK_MCP_CREDENTIALS` override their paths. Credentials and metadata use
private permissions and atomic publication. Diagnostics never print the token;
the explicit `pair` command prints the private URL.

## Upgrade from the owner-process bridge

Upgrading from `0.6.8` requires stopping all old local MCP processes once, then
starting the upgraded Agent adapters. New adapters report an explicit
`bridge_incompatible` tool error when an old bridge occupies the port; they do
not terminate it. The old Agent WebSocket protocol is not supported. Startup
commands, Canvas tool contracts, and the browser bridge protocol are unchanged.
`bridge stop` can stop an older version-2 bridge using its authenticated control
endpoint. Upgrades require restarting adapters with the updated package too:
adapter and bridge package versions must match. For same-version bridge
restarts, existing adapters start a replacement before their next call.

Verification: [adapter lifecycle](test/agent-proxy.test.mjs),
[request isolation and budgets](test/multitenant.test.mjs),
[MCP tool integration](test/server.test.mjs),
[real browser lifecycle](../../tests/local-mcp/production-bridge.spec.mjs).

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
