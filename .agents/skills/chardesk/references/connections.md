# Tool connections

Use this reference when Canvas tools are unavailable or when an agent needs to
connect to a live CharDesk page. Connection setup grants access; the
[live Canvas workflow](live-canvas.md) owns read, search, write, and verification.

## ChatGPT Site Tools

Open the requested URL in ChatGPT's built-in browser. For a new Canvas, use
[`https://canvas.chardesk.com`](https://canvas.chardesk.com). When Site Tools are
disabled, enable `Enable site tools` under `Settings > Browser > Permissions`.
Site Tools belong to the open top-level page.

See the [OpenAI Site Tools documentation](https://learn.chatgpt.com/docs/webmcp).

## Chrome WebMCP

For a compatible agent connected to Chrome, enable
`chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and reopen the
requested URL. A Chrome flag alone does not connect the agent to that browser
instance; discovery must happen in its connected page.

See the [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp).

## Local MCP

Start the local bridge:

```sh
npx -y @chardesk/mcp server
npx -y @chardesk/mcp pair
```

In Canvas, open `Agent → Local MCP` and turn on the connection switch. Grant only the
permissions required by the task: `inspect`, `read`, `search`, and `write`.
Application-scoped pairing can target any Canvas with its short persistent
`canvasId`; a Canvas-scoped pairing is limited to the paired Canvas.

The bridge uses loopback by default, stores credentials locally, and expires
pairings after 30 days. Revoke an active pairing with:

```sh
npx -y @chardesk/mcp revoke
```

If a connection is unavailable, retry discovery once after the required
permission, flag, or browser restart. If it remains unavailable, use the CLI
only when the requested target is an existing local source; otherwise report
the connection limit rather than substituting another workspace.
