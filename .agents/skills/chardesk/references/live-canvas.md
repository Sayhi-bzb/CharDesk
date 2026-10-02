# Live Canvas workflow

Use this reference when the task targets the currently open Canvas rather than
a local file.

## Choose the operation

- If the target Canvas is unknown, call `chardesk_canvas_manage` with `action: "list"`
  and start from `currentCanvas`; archived Canvases are omitted by default. Pass
  `includeArchived: true` only for explicit archived-Canvas work. Inspect
  `canvases` only for explicit cross-Canvas work.
  `list` returns short runtime `canvasRef` handles (`c1`, `c2`, …). Omit the
  reference for the active Canvas; pass `canvasRef` for another Canvas. Handles
  are stable only for the current page/connection, so list again after refresh.
- If the content or location is unknown, search the rendered Canvas text.
- If the location is known, read the smallest useful viewport.
- If the task changes content, read the affected area before writing.

Keep the operation scoped to the user's target. Do not enumerate Canvases or
search the whole surface when the target is already known.

## Compose operations

Use `chardesk_canvas_code` when one task needs conditional, repeated, or
clipboard-aware Canvas operations. Its script receives only
`canvas.read`, `canvas.search`, `canvas.write`, `canvas.manage`, and
`canvas.clipboard`. `preview` is the default and does not persist writes; use
`mode: "apply"` when the requested edit is ready to commit. An applied script
is one undoable checkpoint. Preview writes use the real Canvas renderer and
return their Cell bounds and rendered spans; they are not an echo of the input.
Capability arguments and results are ordinary JavaScript objects, so scripts do
not call `JSON.stringify` or `JSON.parse`. It is a Canvas composition tool, not
a shell and not a general MCP dispatcher. If Code Mode reports
`runtime_unavailable`, continue with the primitive tools.

## Edit loop

```text
locate → read context → write → read returned bounds → verify
```

Treat the default `writeMode: "patch"` as a local edit, not a replacement of an
earlier footprint. Ordinary whitespace is skipped; styled whitespace is written.
Use `writeMode: "replace"` only when intentionally redrawing or clearing a
precise rectangle.
Choose placement from the observed content. Preserve surrounding work and do
not assume that a shorter replacement clears cells outside the new content.

If the payload is ASCII art, code, a Unicode drawing, or otherwise depends on
literal Markdown punctuation, wrap it in a fenced code block before writing.
This protects characters such as `\\`, `_`, `*`, and `>` when the Canvas uses
the default auto/Markdown renderer. Read the returned bounds immediately after
the write to verify the rendered characters.

After writing, use the returned bounds for verification. If the result is a
sampled projection, narrow the viewport before judging text. If the write is
rejected, leave the surface unchanged and report the constraint.

Treat `overviewOnly: true` or `mode: projection|density` as spatial navigation
only. Do not summarize its block or density symbols as Canvas text; search for
the target or read a smaller viewport until `overviewOnly: false`.

`canvas_read` defaults to `representation: "text"`. Choose `representation: "image"`
for layout or color inspection, or `"both"` only when comparison is necessary.
Image `detail` defaults to `auto`; text remains the authority for exact Unicode
and Cell coordinates.

## Read and write discipline

- Read observes the rendered surface; it is not a source-file reader.
- Write sends content to the Canvas renderer; do not manually reproduce the
  rendered appearance.
- Prefer fenced code blocks for content that must be preserved character-for-character.
- Never copy generated rulers, borders, style notes, or density symbols into a
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
