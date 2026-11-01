# Terminal adoption roadmap

| Milestone                                           | Status   | Authority and verification                                                                                                                                                                                                             |
| --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0–M2: shared editing, navigation and external text | Complete | [Editor Core](../../packages/editor-core/README.md), [Host usage](README.md)                                                                                                                                                           |
| M3: reliable document workspace                     | Complete | [Persistence contract](WORKSPACE.md)                                                                                                                                                                                                   |
| M4: drawing, characters and templates               | Complete | [Drawing](../../packages/editor-core/src/drawing/session.test.ts), [character catalog](../../packages/character-library/README.md), [templates](../../packages/canvas-templates/README.md), [native UI](src/workspaceControls.test.ts) |

Milestones describe module adoption, not complete Web interaction parity.

| Interaction follow-up                                                       | Status                | Authority and verification                                                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local session catalog, platform directories, managed canvases and migration | Complete              | [Storage contract](WORKSPACE.md), [service](src/localSessions.test.ts), [startup](src/localWorkspace.test.ts), [panels](src/sessionControls.test.ts)                                           |
| Unified terminal appearance, content palette and RGB export snapshot        | Complete              | [Appearance contract](README.md#terminal-appearance), [runtime and native frames](src/appearance.test.ts), [PNG guards](src/contextMenu.test.ts)                                               |
| Shared coverage, preview, hit-testing and pointer commits                   | Complete              | [Selection contract](../../packages/editor-core/README.md), [native regressions](src/selection-parity.test.ts)                                                                                 |
| Row/column selection; edge/content/page navigation entry points             | Complete              | [Shared selection primitives](../../packages/editor-core/src/selection/static-grid.ts); preserve Option+arrows for pan                                                                         |
| Existing-selection attributes and foreground/background actions             | Complete              | [Inspector](README.md#selection-inspector), [shared rules](../../packages/editor-core/src/selection/style.ts), [cross-host parity](../../apps/canvas/src/app/selectionStyleParity.dom.test.ts) |
| Rich OS clipboard; complete file export                                     | Complete              | [Export/clipboard contract](README.md#export-and-rich-clipboard), [native delivery](src/export.test.ts), [cross-host parity](../../apps/canvas/src/app/clipboardParity.dom.test.ts)            |
| Continuous edge autoscroll                                                  | Complete              | [Shared policy](../../packages/editor-core/src/interaction/edgeScroll.ts), [native lifecycle](src/edgeScroll.test.ts), [terminal reporting limits](README.md#continuous-edge-scrolling)        |
| Terminal modifier delivery on target devices                                | Needs host validation | [Terminal policy](README.md#terminal-input-policy), [Host limits](README.md#verification-and-limits)                                                                                           |

[Selection PNG clipboard](src/snapshot.ts), ANSI text copy and terminal-owned
OSC 8 links are implemented. File export and portable rich clipboard now share
[preparation and codec contracts](../../packages/editor-core/README.md#export-preparation).

## Freeform completion goal

| Phase                          | Status   | Delivery / authority                                                                                                                          |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 selection styles and colors | Complete | [Inspector](README.md#selection-inspector)                                                                                                    |
| P2 selection/navigation        | Complete | [Navigation contract](README.md#selection-and-navigation), [parity](../../apps/canvas/src/app/selectionNavigationParity.dom.test.ts)          |
| P3 export/clipboard            | Complete | [Export and rich clipboard](README.md#export-and-rich-clipboard)                                                                              |
| P4 configuration               | Complete | [Settings](README.md#settings), [shared profile](../../packages/chargraph/src/text-profile.ts), [native regression](src/textSettings.test.ts) |
| P5 local lifecycle/sources     | Complete | [Source observation/reload](WORKSPACE.md#native-file-sources), [record/file removal and interrupted recovery](WORKSPACE.md#removing-sessions) |
| P6 Host interaction            | Complete | [Continuous edge scroll and terminal fallbacks](README.md#continuous-edge-scrolling), [native regressions](src/edgeScroll.test.ts)            |

P1–P6 delivery and automated verification are complete. Native input tests use
OpenTUI frames; executable PTY checks cover configuration/export, source reload,
record/file removal across restart and stationary edge drags. They do not establish
physical terminal forwarding or OS clipboard interoperability. Those environment
limits remain explicit in the [Host contract](README.md#verification-and-limits).

M4 keeps document changes in shared commands. Host panels, resource transport,
query lifetimes and terminal presentation remain adapters. Tool parameters are
per-page view state; unfinished strokes and placements are transient.

Slides, Agent/MCP, collaboration/cloud and a template marketplace
remain outside M4. Native Windows clipboard/filesystem and terminal-specific
shortcut forwarding still require target-environment validation; see the
[Host limits](README.md#verification-and-limits).
