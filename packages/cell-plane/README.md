# CellPlane engine

`@chardesk/cell-plane` owns the sparse styled Unicode plane and operation encoding
used by Web and Terminal. It is a private workspace package.

- Root: `CellPlaneIndex`, operation/patch types and compilation, occupancy readers.
- `text`: native text and ANSI serialization; document envelopes remain owned by
  [`@chardesk/document`](../document/README.md).
- `types`, `grid`, `grid-source`, `grid-ops`: logical Cell data and adapters.

Geometry and frame contracts remain in [`cell-core`](../cell-core/README.md);
Unicode parsing and widths remain in [`protocol`](../protocol/README.md).
This package has no application imports, document persistence, or network I/O.
Its bounded projection caches are derived data, not document authority.

See [Editor Core](../editor-core/README.md) for document ownership and history.
Build and verification commands are owned by [package.json](package.json).
