# Legacy Blackboard migration

Blackboard is retired. Do not create packages, edit panels, or seek Blackboard
MCP/WebMCP tools.

For a local package:

```sh
npx -y @chardesk/cli migrate <blackboard.yaml|directory> --output <name>.chardesk
```

Migration preserves the source and refuses to overwrite the output. Open the
native file with the [CLI](backstage/cli.md). Browser works convert when opened
from Workspace; original source remains downloadable. A failed conversion keeps
the original available for retry. Continue with [Canvas tools](backstage/live-canvas.md)
after conversion.
