# @chardesk/rendering

Shared CharDesk Cell presentation contracts and Canvas 2D presentation. The root
entry owns backend-neutral visuals, frame cells, metrics, and character snapshots;
`./canvas` owns font loading, DPR surface preparation, raster drawing, and the
Canvas frame presenter.

```ts
import { createCharDeskRenderModel } from "@chardesk/rendering";

const model = createCharDeskRenderModel("A界🙂");
```

```ts
import { drawCharDeskCanvasDocument } from "@chardesk/rendering/canvas";

drawCharDeskCanvasDocument(context, model, {
  palette: { color: "#111827", background: "#ffffff" },
  zoom: 1.25,
});
```

The rendering root owns the backend-neutral Cell cursor shape, paint style, and
default blink interval. `drawCharDeskCanvasCursor()` is the shared terminal-cursor
primitive for Canvas hosts. Block, bar, and underline shapes use the allocated Cell rectangle; block
temporarily paints cursor colors and redraws the Cell glyph without changing its
Unicode or stored attributes. Visibility, blink timing, focus, and selection
precedence remain Host interaction state.

The rendering root also owns backend-neutral Cell Range geometry, phase, and
paint style. `createCharDeskRectRangeGeometry()` adapts bounded rectangular
selections; hosts with compound selections supply equivalent polygon rings.
`drawCharDeskCanvasRange()` applies shared Cell-to-pixel, zoom, DPR alignment,
even-odd filling, optional dirty-region clipping, and phase styling. Selecting
and resting Ranges use only the selection surface; moving Ranges add the shared
border. Range ownership, normalization, copying, movement, and history remain
Host state.

`zoom` rasterizes at the requested character size; hosts should size the DPR
backing surface to the returned scaled document layout instead of applying a
CSS bitmap transform.

Cell draw options accept `clipToCell: true` to constrain glyphs and text decorations
to their one- or two-cell pixel allocation. It is opt-in; other consumers keep
the existing unrestricted glyph rendering.

Every foreground Cell retains Unicode `cell.text`. Exact registered Cell graphics use the
shared deterministic painter; other graphemes use the active font profile. Background and clip edges align to device pixels for axis-aligned
transforms. `alignCharDeskCanvasRect(bounds, transform)` provides the same edge
alignment for host dirty-region clears. Rotated/sheared transforms remain
unsnapped; seam-free rasterization is guaranteed only for axis-aligned transforms.

`@chardesk/protocol` owns parsing and Unicode cell layout. Hosts retain
interaction, viewport, and application state.

## Cell graphics

`resolveCharDeskCanvasGlyphSource(text)` is the shared painting/loading/Probe
classifier (`font` or `cell-graphics`). Combining sequences remain font-shaped.
`CELL_GRAPHICS_VERSION` identifies the renderer, not a font face. All Canvas
consumers, including document/PNG rendering, use this path without a toggle.

The 778 definitions are pinned from xterm.js commit
`c58ea3637f3968e0e6e79cd92cf9aace7ef89ee2`; see
[definitions](src/cell-graphics-definitions.ts), the reproducible
[sync script](../../scripts/rendering/sync-xterm-cell-graphics.mjs), and [license](LICENSE.xterm).
The registry contains Box Drawing (128), Block Elements (32), Braille (256),
Powerline (38), Progress (12), Git Branch (62), and Symbols for Legacy Computing
(250). Classification is an exact definition lookup, so combining and multi-codepoint
sequences remain font-shaped.

The local adapter handles normalized paths (`M/L/H/V/C/Q/T/A/Z`), octant rectangles,
shade patterns, Braille dots, filled/stroked vectors, negative shapes, clip paths, and
Cell/character scaling;
it does not import terminal state or WebGL. Update the pinned set with
`npm run cell-graphics:sync`,
retaining attribution and running the coverage and raster tests.

Geometry uses the allocated Cell rectangle, independently of font calibration.
Unicode selects light/heavy/double line shapes; bold/italic do not distort them.
Foreground, inverse colors and decorations retain their existing semantics.
Graphics clip to their allocation even when ordinary font ink may overflow.
Font loading skips registered graphics; JuliaMono remains available for other fallbacks.

Renderer `xterm-cell-graphics-v5` applies a shared 1.5× structural-stroke multiplier before
zoom/DPR rounding: light/heavy base widths are 1.5/4.5px. No user setting or font
calibration changes these widths. Filled graphics, blocks and shade patterns are unaffected. Straight-stroke
centers align by device-pixel stroke parity, independently of Cell-edge alignment;
longitudinal endpoints stay on shared Cell boundaries. The four rounded corners use
tangent quarter circles after center alignment, with a shared radius equal to the
minimum distance from the aligned intersection to the four Cell edges (zero falls
back to a connected right angle). See [geometry tests](src/cell-graphics-path.test.ts).
Double lines retain at least one
clear device pixel between strokes in the supported raster matrix. Uniform positive
axis scales stroke in device space to avoid fractional-transform fringe pixels;
rotated/sheared paths retain unsnapped geometry.

Coverage and source preservation: [unit tests](src/cell-graphics.test.ts).
Chromium/WebKit raster checks at DPR 1/1.25/2 and zoom 0.75/1/1.25/2:
[browser tests](../../e2e/web-tui-cell-graphics.spec.ts). This is an axis-aligned
test matrix, not a guarantee at every transform or subpixel cell size.
Opacity, double-line separation and outline connectivity with fractional translations
are checked by [Box clarity tests](../../e2e/web-tui-box-clarity.spec.ts).

Headless hosts that register subset fonts under unique family names may pass
`fontFamilies` in document or cell draw options. It selects regular and bold
stacks independently for the text and emoji routes without changing browser
font loading defaults.

`fontProfile` is the capability-level path for modular stacks. The same Profile
drives face selection and `loadCharDeskCanvasFonts`; its `fontSizeScale`,
`scaleX`, `baselineShiftEm`, `boldStrategy`, and `boldOverdrawEm` calibrate glyphs without changing
protocol Cell allocation. `fontResolver` and `fontFamilies` remain family-only
host overrides; Profile metrics still apply. The resolver receives effective
`bold` after strategy resolution, consistently in loading and drawing. Only
`native` asks the resolver or Canvas for bold; the source Cell attribute is
unchanged.

For font glyphs only, `overdraw` repeats bold Cell text at the configured
horizontal offset while requesting the regular face. The offset follows face
size and zoom, reuses the same Cell clip, and does not repeat decorations.
`none` requests regular and draws once. Cell Graphics bypass every font-bold
strategy.

## Fixed Cell grids and font measurement

Cell geometry is a synchronous host contract. CharDesk surfaces use a stable
`9×20px` default with a `15px` alphabetic baseline. Browser UI hosts may provide
their own stable metrics. Font loading may trigger glyph repaint and audit, but
must not resize a mounted grid.

`CharDeskCellMetrics` and `DEFAULT_CHARDESK_CELL_METRICS` are exported from the
package root and form the single product geometry contract. `CharDeskCellFrameCell`
and `formatCharDeskCellFrame()` are root exports for producers and inspectors that
must not depend on Canvas.
`presentCharDeskCellFrame()` consumes a storage-neutral `CellFrame` from
`@chardesk/cell-core`; bounded Cell UI buffers and sparse document Canvas readers
therefore share clipping, wide-glyph spans, font routing, dirty filtering, and
Canvas draw order without sharing product state.

The former Canvas-owned names `CharDeskCanvasMetrics`,
`DEFAULT_CHARDESK_CANVAS_METRICS`, and `CharDeskCanvasFrameCell` were removed.
Import their Cell-named replacements from `@chardesk/rendering`; import only
Canvas contexts, raster options, and presenter functions from
`@chardesk/rendering/canvas`.

`measureCharDeskCanvasFont(context, profile, fontSize = 15)` measures a loaded
display face and returns `{ metrics, source, fontMetrics, fontMetricsSource }`.
`fontMetrics` preserves the uncalibrated grid; `metrics` applies the Profile's
overrides. Width is the regular `0` advance
(including profile `scaleX`); height is the `Mg` font ascent + descent, falling
back to its actual glyph bounds when font bounds are unavailable. Measurements
retain fractional CSS pixels and do not depend on content or DPR.

Glyph anchors and baseline offsets retain those fractional coordinates through
`fillText`; the painter does not round each glyph to device pixels. Background
and clip allocation edges are aligned independently. This applies to fixed grids
and standalone font measurements, including zoomed documents; it prevents alternating advances
such as 7/8px for a 7.5px grid without adding tracking or changing Cell spans.

`metrics.baseline` is an alphabetic offset from the Cell top. Omitting it preserves
the existing middle alignment. `profile.capabilities.display.cellMetrics` can
override `width`, `height`, and `baseline` in effective-font em units; an explicit
baseline precedes the existing `baselineShiftEm` adjustment. Automatic baseline
measurement compensates that shift so the measured ascent is applied once.

The browser caller owns loading, caching, repaint, and audit. Fallback glyphs
and proportional fonts can overflow the measured grid; this API does not disable
clipping or guarantee joined border/block glyphs.

## Font grid audit

`auditCharDeskCanvasFont(context, profile, metrics, samples)` audits explicitly
loaded samples (`string` or `{ grapheme, bold?, italic? }`) against the supplied
Surface grid without changing it. The result separates native font geometry,
Profile-calibrated geometry and actual Surface metrics. Each sample reports its
requested family stack, requested/effective bold, advance overflow, vertical ink
bounds and overhang. Repeated `│` / `█` additionally report theoretical
`verticalGap`: positive is a gap, negative is overlap, zero is geometric contact.

Missing ink metrics produce `status: "unavailable"` and null measurements, not
a passing result. Canvas only identifies the requested stack, not the actual
fallback face. These are geometric observations, not a font coverage or raster
certificate; browsers differ on signed glyph bounds. Real-pixel seam checks are
owned by [glyph raster tests](../../e2e/web-tui-glyph-overflow.spec.ts);
the [real-font audit test](../../e2e/web-tui-font-audit.spec.ts) verifies Probe output.
