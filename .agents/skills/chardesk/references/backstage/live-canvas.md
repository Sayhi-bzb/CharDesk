# Live Canvas workflow

Use this reference when the task targets the currently open Canvas rather than
a local file.

## Choose the operation

- If the target Canvas is unknown, inspect the visible Canvases first.
- If the content or location is unknown, search the rendered Canvas text.
- If the location is known, read the smallest useful viewport.
- If the task changes content, read the affected area before writing.

Keep the operation scoped to the user's target. Do not enumerate Canvases or
search the whole surface when the target is already known.

## Edit loop

```text
locate → read context → write → read returned bounds → verify
```

Treat a write as a local edit, not a replacement of an earlier footprint.
Choose placement from the observed content. Preserve surrounding work and do
not assume that a shorter replacement clears cells outside the new content.

After writing, use the returned bounds for verification. If the result is a
sampled projection, narrow the viewport before judging text. If the write is
rejected, leave the surface unchanged and report the constraint.

## Read and write discipline

- Read observes the rendered surface; it is not a source-file reader.
- Write sends content to the Canvas renderer; do not manually reproduce the
  rendered appearance.
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
