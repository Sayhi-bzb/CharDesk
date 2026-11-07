# Shared Canvas templates

`@chardesk/canvas-templates` owns the [component/template catalog](src/catalog.ts)
and [materialization](src/runtime.ts) used by Web and Terminal.

`materializeCanvasTemplate(id, resolveColor)` returns positioned text rows, a
Cell source and logical dimensions. The Host resolves semantic color tokens;
returning `undefined` preserves the artifact's default foreground or omits a
background. Explicit catalog colors remain document colors; artifact-primary foreground
follows the shared [CellPlane color policy](../cell-plane/src/artifact-style.ts).
`getCanvasTemplateMaterialization(id, theme)` provides Web's cached theme adapter.
Browser drag state stays in the Web domain facade; placement and document writes
remain Host/editor responsibilities.

[Cross-policy tests](src/runtime.test.ts) compare the shared materialization
paths. [Web catalog tests](../../apps/canvas/src/domains/canvas-templates/runtime.test.ts)
own catalog color and geometry invariants;
[terminal placement tests](../../examples/terminal-canvas/src/workspaceControls.test.ts)
verify cancellation, negative coordinates, pointer confirmation and save/reopen.

[Package scripts](package.json) own build and test commands.
