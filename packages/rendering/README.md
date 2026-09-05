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

`blockGlyphs: "geometry"` paints solid Unicode blocks (`U+2580–U+2590`,
`U+2594–U+259F`) as disjoint Cell-relative rectangles, bypassing fonts. The default
is `"font"`; shades, box drawing, ordinary text and `▬` always retain the font path.
Foreground overrides, inverse colors, alpha and text decorations use the same
pipeline. Bold does not expand geometric blocks.

Geometry mode aligns background, clip and block edges to device pixels for
axis-aligned transforms. `alignCharDeskCanvasRect(bounds, transform)` provides
the same edge alignment for host dirty-region clears. Tiny regions may collapse
to zero pixels. Rotated/sheared transforms retain unsnapped geometric rendering;
seam-free rasterization is only guaranteed for axis-aligned transforms.

`@chardesk/protocol` owns parsing and Unicode cell layout. Hosts retain
interaction, viewport, and application state.

Headless hosts that register subset fonts under unique family names may pass
`fontFamilies` in document or cell draw options. It selects regular and bold
stacks independently for the text and emoji routes without changing browser
font loading defaults.
