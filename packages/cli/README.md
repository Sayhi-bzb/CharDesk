# @chardesk/cli

Create native CharDesk files, inspect visual text, open a read-only live Canvas,
and render artifacts. No checkout or dev server is required.

## Native files

```sh
npx -y @chardesk/cli init diagram.chardesk --title "Diagram"
npx -y @chardesk/cli init deck.chardesk --mode slide
npx -y @chardesk/cli inspect diagram.chardesk --styles --json
npx -y @chardesk/cli open diagram.chardesk
```

`init` creates one [document/v1 file](../document/README.md), defaulting to
Freeform, and refuses existing paths. Edit that file with normal filesystem tools.
Native Slide decks open in the browser; headless inspect/render do not render decks.

`open` serves the bundled Canvas at a tokenized loopback `/s/<token>/` URL.
The preview cannot edit or upload the file. File changes update the same preview.
Canonical paths and symlinks reuse a healthy session. `--no-browser` prints its URL;
`--port` selects a port; `--foreground` attaches server lifetime to the command.

```sh
npx -y @chardesk/cli status
npx -y @chardesk/cli close diagram.chardesk
npx -y @chardesk/cli close --all
```

Idle sessions expire after 30 minutes without clients. A browser readiness failure
returns a PNG fallback when the input supports rendering. `open --json` exposes
`status`, `input`, `url`, `runtimeReady`, and `watching`.

## Inspect and render

```sh
npx -y @chardesk/cli inspect input.md --json
npx -y @chardesk/cli inspect diagram.chardesk --region 0,0,96,32 --styles
npx -y @chardesk/cli render input.md -o output.png --strict --json
```

Inspect defaults to bounded materialized text. Block-layout source is stacked in
source order; `--canvas` requests its spatial projection. `--region x,y,w,h`
implies Canvas inspection; `--no-ruler` hides coordinates; `--styles` adds evidence.

Auto input treats `.chardesk` as Protocol and other files or stdin as CharGraph.
Overrides are `--input chargraph|chardesk`. Stdin works for inspect/render, not open.

| Output | Format |
| --- | --- |
| `.png` | Raster image |
| `.chardesk` | Native Freeform document |
| `.ans` | Terminal ANSI |
| `.txt` | Plain Unicode |

`--format png|chardesk|ansi|text` overrides suffix inference. Stdout requires an
explicit non-PNG format. PNG accepts `--scale 1..4` (default 2) and
`--padding 0..256` (default 16). Render replaces its explicit output atomically;
`--strict` rejects diagnostics before replacement.

## Retired Blackboard input

```sh
npx -y @chardesk/cli migrate <blackboard.yaml|directory> --output converted.chardesk
```

Migration preserves source files, retains Slide order and rendering, and refuses
existing outputs. Normal commands do not compile Blackboard directories.
`--input blackboard` and `--panel` are removed.

Exit codes: 0 success, 1 content/runtime/write failure, 2 invalid arguments.
Implementation and verification: [commands](src/command.ts), [migration](src/migrate.ts),
[preview server](src/preview-server.ts), and [contract tests](src/command.test.ts).
