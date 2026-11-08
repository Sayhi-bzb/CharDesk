# Shared Canvas templates

`@chardesk/canvas-templates` owns the [component/template catalog](src/catalog.ts)
and [materialization](src/runtime.ts) used by Web and Terminal.

[Welcome](src/welcome.ts) also owns the default canvas layout used by both Hosts.
Its [visual examples](assets/welcome/default-demo.md) and generated CharGraph cases
are compiled into a runtime-neutral module by `npm run welcome:generate`;
`npm run welcome:verify` checks both generated artifacts. The Web
[default-canvas tests](../../apps/canvas/src/domains/canvas/state/helpers/defaultDemo.test.ts)
and Terminal [startup tests](../../examples/terminal-canvas/src/localWorkspace.test.ts)
verify consumption. Host persistence decides when to seed Welcome.

[Welcome appearance](src/welcome-appearance.ts) owns neutral color roles and the
read-only Cell projection used by Web, Terminal and local reads. Hosts supply
their foreground/background; neutral ink derives from that palette, while hue art
and authored background pairs retain literal RGB. Native/text exports retain source
colors. Full surfaces retain incremental changes; cropped/preview sources can supply
their original Welcome scope. [Cross-source tests](src/welcome-appearance.test.ts)
and [Web integration tests](../../apps/canvas/src/app/welcomeAppearance.test.ts)
verify the contract. CSS-to-RGB conversion stays in the Web adapter.

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
