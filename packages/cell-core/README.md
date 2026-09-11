# @chardesk/cell-core

Presentation-neutral contracts for logical Cell geometry, readable Cell sources,
incremental changes, and committed frames. The package has no React, DOM,
Canvas, font, or product-state dependency.

```sh
npm install @chardesk/cell-core
```

`CellSource.visit()` is the canonical bounded traversal API. Sources may be dense
or sparse; callers must not infer storage shape. Rectangles use finite integer
coordinates and half-open bounds. `normalizeCellRect`, `intersectCellRects`, and
`cellRectContainsPoint` are the shared geometry rules for storage and UI adapters.

```ts
import type { CellFrame } from "@chardesk/cell-core";

const frame: CellFrame<MyCell> = {
  revision,
  viewport: { x: 0, y: 0, width: 80, height: 24 },
  source,
  dirty: "full",
};
```

`formatCellFrame(frame, project, options)` is the storage-neutral character
snapshot authority. The projector supplies only `text` and logical width; Core
preserves sparse positions and wide-Cell continuation columns.

`resolveCellRangeBounds()` owns rectangular selection normalization.
`resolveCellRangeSpans()` owns per-row normalization and merging for compound
selections. Hosts provide optional bounds and a footprint resolver so wide
graphemes remain complete; interaction state and text extraction stay with the
host.
