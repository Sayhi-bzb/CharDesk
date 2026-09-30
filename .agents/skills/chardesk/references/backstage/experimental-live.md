# Experimental live backstage

Discover capabilities on the requested page before choosing a workflow:

- `chardesk_canvas_*` provides spatial reading and, where editable, writing;
  use [live Canvas](live-canvas.md).
- A read-only preview offers read/search without write.

When the required capability is missing, inspect setup without replacing the
requested page or active Canvas.

## ChatGPT Site Tools

In the ChatGPT app, open the requested URL in the built-in browser. For a new
Canvas, use [`https://canvas.chardesk.com`](https://canvas.chardesk.com).
When Site Tools are disabled, open the settings surface when
available; the user enables `Enable site tools` under
`Settings > Browser > Permissions`. Site Tools belong to the open top-level
page.

See the official [OpenAI Site Tools documentation](https://learn.chatgpt.com/docs/webmcp).

## Chrome WebMCP

For a compatible Agent connected to Chrome, open
`chrome://flags/#enable-webmcp-testing`. The user enables the flag and relaunches
Chrome, then reopens the requested URL. A Chrome flag alone does not connect
the Agent to that browser instance; discovery must happen in its connected page.

See the official [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp).

## Guided activation

The user completes only permission changes, flag changes, and browser restart.
Retry discovery once. If tools remain unavailable, use the [CLI](cli.md) only
when an existing local source is the intended target, or the user requested a
new local deliverable. Otherwise report the connection limit; do not substitute
an unrelated workspace or local snapshot for the requested live Canvas.
