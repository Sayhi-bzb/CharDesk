# Live Canvas backstage

Use `chardesk_canvas_read` to observe the active Canvas and
`chardesk_canvas_write` to edit its Cell content when available. These operate on
the current surface, not a file path. Tool definitions own parameter schemas.

## Read

Start with `{}` for orientation unless the target region is already known.
Move or resize `viewport: [x,y,width,height]` to inspect nearby content or zoom
into a target. Coordinates are original Cells, not screen pixels or string
indices; a wide grapheme occupies two Cells.

Text mode returns the spatial characters, row/column rulers, and non-empty
style notes. `y=… x=…` ranges are inclusive absolute Canvas coordinates.
Projection and density modes are navigation maps; shrink the viewport to read
actual text and styles. A read observes the rendered surface, not original
Markdown or ANSI source, and does not move the human's camera.

## Write and verify

Read the affected region before choosing placement or replacing existing content.
Read's write-rendering note identifies the current mode, theme, wrapping, and
feature settings. Write text using `at: [x,y]` and `content`; the shared Canvas
renderer interprets Markdown or ANSI when enabled. Prefer their source syntax
over manually reproducing rendered styles. Never copy generated read rulers, borders, style
notes, or sampled map symbols into the write payload.

Rendered characters and styles replace the positions they occupy; unwritten
positions remain unchanged. Backgrounds remain unless rendering supplies one.
Wrapping and tab expansion follow the current renderer. Only rendered Cells
persist, not the input source: these settings do not establish the origin of
existing content. There is no source round-trip or automatic replacement of an
earlier write's whole footprint; a shorter replacement can leave old Cells behind.

Read the returned non-null `bounds` as a viewport to verify the change. If that
read is sampled, inspect smaller regions in text mode. `bounds: null` means no
positions were written. Each successful write is independently undoable and
leaves the camera, cursor, and selection unchanged.

## Source-backed and read-only surfaces

For a Blackboard projection, edit source through the
[live workspace tools](live-workspace.md). For a local CLI reader, edit the
existing files through the [CLI workflow](cli.md); the open projection updates
automatically. Canvas read can verify either result when available.

A `source_backed_canvas` result routes the edit to its source, not to another
Canvas. A Slide overflow requires an in-bounds placement; the rejected write
has changed nothing. If write is absent, do not bypass the read-only surface.
When the intended source cannot be reached, report the missing capability.

Contracts: [Canvas reading](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/architecture/canvas-reading.mdx)
and [Canvas writing](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/architecture/canvas-writing.mdx).
