# @chardesk/rendering

Shared CharDesk render models and Canvas 2D primitives. The root entry resolves
protocol cells without depending on a rendering backend; `./canvas` owns the
pixel metrics, font loading, DPR surface preparation, and cell painter.

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

`zoom` rasterizes at the requested character size; hosts should size the DPR
backing surface to the returned scaled document layout instead of applying a
CSS bitmap transform.

Cell draw options accept `clipToCell: true` to constrain glyphs and text decorations
to their one- or two-cell pixel allocation. It is opt-in; other consumers keep
the existing unrestricted glyph rendering.

`CharDeskCanvasCellDrawEntry.primitive` is an explicit, optional presentation
projection. `line` stores Cell-edge connectivity and square/rounded joins;
`fill` stores normalized Cell-relative rectangles. A primitive bypasses fonts,
but the entry's `cell.text` remains the copy/snapshot value. Unmarked box and
block characters always retain the font path.

Background, clip, line and fill edges align to device pixels for axis-aligned
transforms. `alignCharDeskCanvasRect(bounds, transform)` provides the same edge
alignment for host dirty-region clears. Rotated/sheared transforms remain
unsnapped; seam-free rasterization is guaranteed only for axis-aligned transforms.

`@chardesk/protocol` owns parsing and Unicode cell layout. Hosts retain
interaction, viewport, and application state.

Headless hosts that register subset fonts under unique family names may pass
`fontFamilies` in document or cell draw options. It selects regular and bold
stacks independently for the text and emoji routes without changing browser
font loading defaults.

`fontProfile` is the capability-level path for modular stacks. The same Profile
drives face selection and `loadCharDeskCanvasFonts`; its `fontSizeScale`,
`scaleX`, `baselineShiftEm`, and `weightPolicy` calibrate glyphs without changing
protocol Cell allocation. `fontResolver` and `fontFamilies` remain family-only
host overrides; Profile metrics still apply. Explicit Cell primitives bypass
font resolution.
