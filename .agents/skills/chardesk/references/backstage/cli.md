# Local backstage

Use `@chardesk/cli` for native files and artifacts. Edit files with filesystem tools.

```sh
npx -y @chardesk/cli init <name>.chardesk --title "<title>"
npx -y @chardesk/cli init <name>.chardesk --mode slide --title "<title>"
npx -y @chardesk/cli inspect <file> --json
npx -y @chardesk/cli open <file.chardesk>
npx -y @chardesk/cli render <input> -o <output> --strict --json
```

`init` refuses existing files. `inspect` returns materialized text; use
`--canvas`, `--region x,y,w,h`, or `--styles` for spatial or style evidence.
Native Slide decks open in the browser; CLI inspect/render do not render decks.

`open` reuses a managed read-only preview and watches its file. `--no-browser`
returns its URL. `render` produces PNG, `.chardesk`, ANSI, or text.
Stdin works for inspect/render, not open. No checkout or dev server is required.

Legacy files use [explicit migration](../blackboard.md), never normal authoring.
