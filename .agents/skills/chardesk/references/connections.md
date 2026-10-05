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

Add CharDesk MCP to the Agent once:

```sh
npx -y @chardesk/mcp
```

The Agent starts the local bridge on every launch. When a Canvas page is open it
discovers the bridge on loopback and connects automatically. The Agent → Local
MCP panel is only for checking status, changing permissions, or opting out.
Grant only the permissions required by the task: `inspect`, `read`, `search`,
and `write`.

If a Canvas tool is called before a page is open, the broker opens the default
Canvas URL once and returns a retryable connection message. Set
`CHARDESK_CANVAS_URL` to use another Canvas URL, or
`CHARDESK_MCP_OPEN_CANVAS=0` to disable automatic opening.
Application-scoped pairing can target any Canvas with its short persistent
`canvasId`; a Canvas-scoped pairing is limited to the paired Canvas.

The bridge uses loopback by default, stores credentials locally, and expires
pairings after 30 days. Revoke an active pairing with:

```sh
npx -y @chardesk/mcp revoke
```

If a connection is unavailable, leave the Canvas open while the Agent starts;
the page retries local discovery automatically. Use the CLI only when the
requested target is an existing local source; otherwise report the connection
limit rather than substituting another workspace.
