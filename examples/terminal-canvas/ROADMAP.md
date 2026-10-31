# Terminal adoption roadmap

| Milestone                                           | Status   | Authority and verification                                                                                                                                                                                                             |
| --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0–M2: shared editing, navigation and external text | Complete | [Editor Core](../../packages/editor-core/README.md), [Host usage](README.md)                                                                                                                                                           |
| M3: reliable document workspace                     | Complete | [Persistence contract](WORKSPACE.md)                                                                                                                                                                                                   |
| M4: drawing, characters and templates               | Complete | [Drawing](../../packages/editor-core/src/drawing/session.test.ts), [character catalog](../../packages/character-library/README.md), [templates](../../packages/canvas-templates/README.md), [native UI](src/workspaceControls.test.ts) |

Milestones describe module adoption, not complete Web interaction parity.

| Interaction follow-up                                           | Status                | Authority and verification                                                                                                                                     |
| --------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared coverage, preview, hit-testing and pointer commits       | Complete              | [Selection contract](../../packages/editor-core/README.md), [native regressions](src/selection-parity.test.ts)                                                 |
| Row/column selection; edge/content/page navigation entry points | Planned               | [Shared selection primitives](../../packages/editor-core/src/selection/static-grid.ts); preserve Option+arrows for pan                                         |
| Existing-selection attributes and foreground/background actions | Planned               | [Web document commands](../../apps/canvas/src/domains/canvas/state/canvasDocumentCommands.ts)                                                                  |
| Rich/ANSI OS clipboard; link activation and context actions     | Planned               | [Terminal clipboard adapter](src/clipboard.ts), [Web click policy](../../apps/canvas/src/widgets/canvas-editor/hooks/interaction/gestures/clickInteraction.ts) |
| Continuous edge autoscroll; terminal modifier delivery          | Needs host validation | [Web edge scroll](../../apps/canvas/src/widgets/canvas-editor/engine/CanvasEdgeScrollManager.ts), [Host limits](README.md#verification-and-limits)             |

M4 keeps document changes in shared commands. Host panels, resource transport,
query lifetimes and terminal presentation remain adapters. Tool parameters are
per-page view state; unfinished strokes and placements are transient.

Slides, Agent/MCP, PNG delivery, collaboration/cloud and a template marketplace
remain outside M4. Native Windows clipboard/filesystem and terminal-specific
shortcut forwarding still require target-environment validation; see the
[Host limits](README.md#verification-and-limits).
