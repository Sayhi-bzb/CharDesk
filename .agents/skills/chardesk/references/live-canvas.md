# Live Canvas workflow

Use this reference when the task targets the currently open Canvas rather than
a local file.

## Choose the operation

- If the target Canvas is unknown, call `canvas_manage` with `action: "list"`
  and start from `currentCanvas`; archived Canvases are omitted by default. Pass
  `includeArchived: true` only for explicit archived-Canvas work. Inspect
  `canvases` only for explicit cross-Canvas work.
  `list` returns short persistent `canvasId` values. Omit the ID for the active
  Canvas; pass `canvasId` for another Canvas. IDs remain stable across page
  refreshes and MCP reconnects.
- If the content or location is unknown, search the rendered Canvas text.
- If the location is known, read the smallest useful viewport.
- If the task changes content, read the affected area before writing.

Keep the operation scoped to the user's target. Do not enumerate Canvases or
search the whole surface when the target is already known.

For Slide Scenes, use `canvas_manage` with `list_pages` to discover
stable `pageId` values and names. Pass `pageId` to read, search, write, erase,
fill, or render when operating on a specific page; omitting it uses the active
page. Page-targeted content operations do not change the user's active page.

Treat the Canvas as a two-dimensional workspace, not an append-only text file.
Use vertical placement for continuity within one content stream. Use horizontal
placement for parallel modules, topics, roles, comparisons, or branches. Before
writing, decide whether new material continues an existing stream or starts a
parallel dimension; do not default to appending below the lowest content.

## Compose operations

Use `canvas_code` when one task needs conditional, repeated, or
clipboard-aware Canvas operations. Its script receives only
`canvas.read`, `canvas.search`, `canvas.write`, `canvas.erase`, `canvas.fill`,
`canvas.render`, `canvas.manage`, `canvas.undo`, and `canvas.clipboard`. `preview` is the default and does not persist writes; use
`mode: "apply"` when the requested edit is ready to commit. An applied script
is one undoable checkpoint and returns an `operationId`; a later apply call can
call `canvas.undo({ operationId })` while that operation is still the latest
edit. One apply targets one Canvas. Preview writes and renders use the same
placement rules and return Cell bounds; they do not mutate the Canvas.
Capability arguments and results are ordinary JavaScript objects, so scripts do
not call `JSON.stringify` or `JSON.parse`. It is a Canvas composition tool, not
a shell and not a general MCP dispatcher. If Code Mode reports
`runtime_unavailable`, continue with the primitive tools.

## Edit loop

```text
locate → read context → write → read returned bounds → verify
```

Treat `canvas.write` as one continuous literal-Unicode stroke: non-whitespace
graphemes overwrite existing Cells with one optional style, while whitespace is
transparent. Use `canvas.erase` for explicit clearing and `canvas.fill` to style
existing characters without changing their content. Use `canvas.render` when the
input is Markdown, ANSI, or another material format.

Literal ASCII art, code, and Unicode drawings can be written directly. If the
input is Markdown or ANSI material, use `canvas.render` so the material renderer
is explicit. Read the returned bounds immediately after the write to verify the
rendered characters.

Keep content production separate from Canvas projection. When an external
artifact already exists, prefer passing its reference so Canvas can consume it
directly; use inline `content` or `source` only for short, transient input.
Do not reread, copy, or rewrite a complete artifact merely to call a Canvas
tool. In the local MCP, pass the artifact path as `sourceRef` to `canvas.write`
or `canvas.render`; the corresponding inline field and `sourceRef` are mutually
exclusive. Browser-only WebMCP calls do not have local filesystem access and
must use inline input.

After writing, use the returned bounds for verification. If the result is a
sampled projection, narrow the viewport before judging text. If the write is
rejected, leave the surface unchanged and report the constraint.

Treat `overviewOnly: true` or `mode: projection|density` as spatial navigation
only. Do not summarize its block or density symbols as Canvas text; search for
the target or read a smaller viewport until `overviewOnly: false`.

`canvas_read` defaults to `representation: "text"` and `style: "none"` so ordinary
navigation stays compact. Use `style: "appearance"` when the agent needs merged
spatial style regions and renderer context. Use `representation: "cells"` for
exact Cell characters and styles, `"image"` for layout or color inspection, or
`"both"` only when comparison is necessary. Image `detail` defaults to `auto`;
text remains the authority for exact Unicode and Cell coordinates.

## Read and write discipline

- Read observes the rendered surface; it is not a source-file reader.
- Write sends content to the Canvas renderer; do not manually reproduce the
  rendered appearance.
- Prefer fenced code blocks for content that must be preserved character-for-character.
- Never copy generated rulers, borders, appearance notes, or density symbols into a
  write payload.
- Preserve the user's source syntax when the active renderer supports it.
- Treat read-only or source-backed surfaces according to the capability exposed
  by the tool; do not bypass a rejected write through another surface.

For source-file edits, use the CLI workflow instead. For protocol details,
schemas, coordinate rules, result fields, and renderer behavior, use the linked
Canvas architecture docs and the MCP tool contract rather than this workflow.

## References

- [Canvas reading](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/architecture/canvas-reading.mdx)
- [Canvas searching](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/architecture/canvas-searching.mdx)
- [Canvas writing](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/architecture/canvas-writing.mdx)
