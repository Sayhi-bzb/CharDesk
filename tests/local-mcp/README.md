# Local MCP

Does a local coding agent edit the Canvas visible in a browser?

```text
MCP client → stdio server ⇄ loopback WebSocket ⇄ Canvas read/write → rendering
```

## Use with Pi

Requires Node 24+, Pi with `pi-mcp-adapter`, and working model credentials.
From the repository root:

```sh
npm install --prefix tests/local-mcp
npm run dev:app
pi
```

Run `pi` in a separate terminal. Trust the project and approve its `chardesk`
MCP server when asked. [The project configuration](../../.pi/mcp-adapter.json)
is discovered automatically; restart an already-running Pi after adding it.

In another terminal, run `npm run mcp:pair`. In Canvas, choose
**Open menu → Connect local agent**, paste that private pairing URL, and connect.
Tell Pi to explain GPU on the connected Canvas.

Choose **Remember for 30 days** to reconnect automatically on this browser to
the same Canvas after a page reload or Pi restart. The local credential keeps
its original expiry across restarts; reconnecting does not extend it. Pi must
still be running. Switching Canvas or choosing Disconnect stops automatic
reconnection for the current page.

**Forget pairing** clears this browser's saved credential. `npm run mcp:revoke`
revokes the local credential for every browser and disconnects the paired page;
use `npm run mcp:pair` to obtain a new URL. After expiry, restart Pi and pair again.

Only one Pi bridge can occupy port 9494, and one page can connect at a time.
Closing Pi, switching Canvas, or choosing Disconnect ends the connection.
Closing the dialog does not. Documents are not stored by the bridge. Remembering
stores the credential and Canvas ID in this browser's local storage, not the account.
Source-backed Canvas content remains read-only through Canvas write.

## Contract

Both MCP and WebMCP consume [one tool definition](../../apps/canvas/src/app/site-tools/canvasToolDefinitions.ts).
The [page connection](../../apps/canvas/src/shared/services/local-agent.ts) calls
the existing Canvas command boundary directly; WebMCP browser support is not required.
The server does not store or render documents. It publishes tools before pairing;
calls made without a connected page fail explicitly.

The service binds only to `127.0.0.1`, checks Host/Origin plus a random
connection token, bounds payloads and pending calls, and does not replay writes.
A timeout/disconnect means a write's outcome may be unknown; read before retrying.

The pairing file and persistent credential file are private and ignored by Git.
Do not share the URL. Request IDs are deduplicated within the current page
connection's last 128 completed calls, not across reconnections. Reconnect manually
after expiry or revocation; writes are never automatically replayed.
Nothing is sent to the VPS. Hosted-page HTTPS-to-loopback permissions remain
browser-dependent and are not covered by the local HTTP test.

## Verify

```sh
npm test --prefix tests/local-mcp
npm run test:pi --prefix tests/local-mcp
```

The [bridge test](bridge.spec.mjs) uses the real menu without a polyfill or script
injection. [The Pi test](pi.spec.mjs) starts Pi without `--mcp-config`, uses the
project server approved during interactive setup, and invokes its real model
(consuming API quota).
Pi reads a region, writes its own GPU explanation, then reads back to verify.
The test checks the tool events against the actual page content and saves a
rendering screenshot. Pi cannot use filesystem or shell tools during this run.
Ordinary `npm test` skips this model-dependent check.
