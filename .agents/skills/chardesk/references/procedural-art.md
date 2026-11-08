# Generate editable Cells from code

Use this workflow for an algorithmic picture, pattern, simulation snapshot or an
existing generator's frame that should become editable Canvas content. The
subject, generator and encoding remain task choices.

**Generator** → **character or color frame** → **Unicode / ANSI material** → **Canvas Cells**  
　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　↓  
　　　　　　　　　　　　　　　　　　　　　　　　　　　　**read back and inspect**

## Choose the path

| Input or computation | Projection |
| --- | --- |
| Line drawings, floor plans, diagrams or literal Unicode rows | Generate native line junctions, symbols and text; use `canvas.write({ at, content, style })`. |
| Color samples, optionally with a coverage mask | Encode as truecolor half-block ANSI; use `canvas.render({ at, source, format: "ansi", writeMode: "patch" })` for transparent placement. |
| Existing ANSI artifact | Local MCP `canvas_render({ at, sourceRef, format: "ansi", writeMode: "patch" })`; pass the artifact rather than copying it through the agent. |
| Module dependencies, browser/GPU rendering, or expensive simulation | Generate outside Code Mode and project the resulting artifact. |

Code Mode is a bounded computation/composition call, not a playback loop. Each
call has a fresh QuickJS context; Canvas stores rendered Cells, not a retained
script. Keep source separately when reproducibility or later editing matters.
A stateful simulation is also a valid generator.

## Compose with the current tool contract

Follow [live Canvas targeting, placement and edit verification](live-canvas.md).
Derive `at`, Canvas/page identity and replacement behavior from the task and
inspected surface. Do not copy a demonstration's coordinates or create another
Canvas merely to avoid finding the requested target. In Slides, fit the projected
Cell dimensions to the finite page.

For an inline computation, send ordinary JavaScript as the `canvas_code` script.
The script can compute with standard JS and typed arrays and call the provided
Canvas capabilities. It has no DOM, network, filesystem or animation timers.
Use the current schema and [runtime implementation](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/canvas/src/app/site-tools/canvasCode.ts)
for execution, script, memory, operation and result budgets; do not assume the
same budgets in future versions.

Return compact summaries such as bounds, written Cell count, an operation ID when available, and
persistence. Avoid returning entire RGB buffers, ANSI strings or capability
results containing all Cells. Generation, material parsing, projection and result
transfer can have different costs. A preview timeout does not establish a fixed
frame-size limit or justify blindly repeating a mutation. Inspect the error and
actual surface impact; reduce work or use the external-artifact path as needed.
Prefer one full-frame patch projection. For computation outside Code Mode, emit
an ANSI artifact and submit it once through `canvas_render` with `sourceRef` and
`writeMode:"patch"`. Use strips only after a demonstrated payload or execution
limit, preserving original offsets and styles; there is no universal strip size.

The MCP process and browser execution page can run different versions. When
support is uncertain, a non-mutating Code Mode preview using `source:" X "`,
`format:"raw"` and `writeMode:"patch"` should report one written Cell and two skipped positions.
If it reports three written Cells, that preview path is ignoring the mode. If
Code Mode times out, distinguish pure generation from a small capability call.
When direct MCP patch works, generate outside the sandbox and use the artifact
path rather than defaulting to many per-row calls. A new tool schema alone does
not verify the page implementation. Inspect any unknown write before retrying.

Preview is non-mutating; use apply for the user's authorized edit. Inspect the
returned bounds and persistence after apply, using the undo contract in the live
Canvas reference when impact is unexpected.

For a spatial scene with overlapping objects, use the [miniature scene case](miniature-art.md).
It separates geometry and art direction from Cell encoding. For parts, assembly
relationships and exploded views, use the [exploded assembly case](exploded-assembly.md).

## Encode a generated frame

[procedural-frame.js](../assets/procedural-frame.js) contains definitions only.
Load it as text, then append a caller to the same Code Mode script. It does not
import modules, access the host or choose a Canvas. The generator supplies
`frame`: `{width, height, data, mask?}`, with top-down RGB bytes in `data`.
The [miniature scene](miniature-art.md#reusable-source-and-complete-example)
provides a complete generator and caller.

After generating a frame and selecting placement, append:

```js
const material = encodeHalfBlocks(frame);
const result = await canvas.render({
  at: chosenAt, // Bind from the inspected target before executing.
  source: material.source, format: material.format, writeMode: "patch",
  // Add pageId here when targeting a specific Slide page.
});
if (result.ok === false) return { code: result.code, message: result.message };
return {
  bounds: result.bounds, writtenCells: result.writtenCells,
  operationId: result.operationId, persistence: result.persistence,
};
```

RGB channels are display-referred values in 0..255. External renderers should
perform their own color conversion and supply binary coverage when needed.

For `▀`, foreground is the upper color sample and background the lower. Width W
and height H samples produce W × ceil(H/2) Cells; an odd final sample row leaves
the lower half uncovered unless a background is explicitly supplied. The encoder
accepts top-down or bottom-up row order and resets styles between Cells. Half-blocks assume the
chosen Cell metrics make the packed samples suitable for the intended picture;
check aspect rather than stretching a frame to an arbitrary grid.

Direct character generators can skip RGB and this encoder entirely. Whitespace
and replacement semantics remain those of the selected Canvas tool.

## Background and coverage

Leave decorative background unspecified by default. Native line drawings should
write only linework and text, with no background style or filled whitespace.
Choose foreground colors for the inspected Canvas theme; fixed colors do not
automatically change when the theme changes.

Color pictures use `frame.mask`, with one binary coverage value per RGB sample:
zero means empty and nonzero means opaque content. An absent mask means every
RGB sample is content. Keep coverage separate from color; a black object is
still an object. `encodeHalfBlocks` packs each upper/lower pair as follows:

| Covered samples | Output |
| --- | --- |
| Neither | Unstyled space in `source`; omitted from `runs`. |
| Upper only | `▀` with foreground only. |
| Lower only | `▄` with foreground only. |
| Both | `▀` with upper foreground and lower background. |

In the last row, ANSI `bgColor` represents the object's lower color sample, not a
decorative page background. Do not delete it indiscriminately. To deliberately
flatten onto a matte, pass `encodeHalfBlocks(frame,{background:[r,g,b]})`.
This fills uncovered samples as well as an odd final lower half.

This is binary coverage, not fractional alpha or compositing with an existing
glyph in the same Cell. For sparse placement, use `material.source` with
`writeMode:"patch"`: the full material is submitted once, and empty unstyled
positions are skipped. Preview and apply use the same mode. The public
[projection tool contract](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/mcp/README.md) owns patch/replace
semantics. For adapters without patch support, `material.runs` provides individual
nonempty spans with a relative Cell `at`, an ANSI `source` with no empty Cells, and `format`. Add the
Canvas placement to each offset and project those runs in bounded batches only
when the host lacks patch support. Without `writeMode:"patch"`, a full-source
render uses replace semantics and can materialize its unstyled spaces as Cells.

Clearing and replacement remain explicit Canvas edits:
omitting a background does not erase a previous one. On replacement, inspect and
clear the prior owned footprint before projecting the transparent result; preserve
unrelated content. Verify empty regions have no Cells, rather than only checking
that their apparent color matches the Canvas.

## Verify the result

- Check exact characters and foreground/background colors with a small
  `canvas_read` region using `representation: "cells"`.
- Read the returned picture bounds with `representation: "image"` to assess
  composition, aspect, clipping and color. Navigation projections are not exact
  character evidence; use bounded exact reads when needed.
- For reusable encoders, verify all four coverage pairs, upper/lower row order,
  odd-height coverage, style reset, ANSI decoding and different generators. Use temporary fixtures
  for tests; undo test-only live edits before further edits invalidate undo.

The motivating Tokyo Rain trial reused an existing generator, executed its
JavaScript in Code Mode, and projected a full color frame as half-block Cells.
It demonstrates one feasible path, not a guarantee of one-shot art quality,
a universal palette, a required resolution or permission to reuse unlicensed
source. Preserve provenance when adapting external generators.
