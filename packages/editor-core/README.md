# Shared editor core

`@chardesk/editor-core` provides the headless editing contracts used by Web and
Terminal. It is private. [Ownership](../../apps/docs/content/docs/development/architecture/ownership.mdx)
owns dependency direction; this page routes the shared APIs and their verification.

| Contract                                                                  | Implementation                                                        | Verification                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Generic runtime, commands, binding catalog, tools and extension lifecycle | [`editor/`](src/editor/runtime.ts)                                    | [Web editor tests](../../apps/canvas/src/domains/editor/core/runtime.dom.test.ts)                         |
| Local Freeform composition                                                | [`FreeformEditorSession`](src/runtime.ts)                             | [Session tests](src/runtime.test.ts)                                                                      |
| Pointer state machine, selection/range movement and preview projection    | [`interaction/`](src/interaction/canvasToolRuntime.ts)                | [Gesture sequences](src/interaction/session.test.ts)                                                      |
| Selection endpoints, focus, fill, deletion and input sessions             | [`selection/`](src/selection/commands.ts)                             | [Cross-host sequences](../../apps/canvas/src/domains/canvas/state/sharedEditorCore.test.ts)               |
| Copy/Cut/Paste orchestration and plain/rich payloads                      | [`clipboard/`](src/clipboard/commands.ts)                             | [Clipboard failure/lifecycle tests](src/clipboard/commands.test.ts)                                       |
| Addressed Yjs documents, pages, anchors and semantic undo history         | [`CanvasDocumentRegistry`](src/CanvasDocumentRegistry.ts)             | [Web document tests](../../apps/canvas/src/domains/canvas/state/canvasDocument-collaboration.dom.test.ts) |
| Final-state publication around synchronous commands                       | [`CanvasStateCommitCoordinator`](src/CanvasStateCommitCoordinator.ts) | [Web publication tests](../../apps/canvas/src/domains/canvas/state/CanvasStateCommitCoordinator.test.ts)  |

[`selection/style`](src/selection/style.ts) owns selection attribute/color patches
and mixed-state queries for both Hosts. Coverage expands wide glyphs once and
preserves disjoint holes. Missing cells materialize only for visible blank styles
or backgrounds; removing the final visible style removes unlinked blank cells.
Queries return `limited` before expensive coverage expansion; edits reject oversized
requests before writing. [Style tests](src/selection/style.test.ts),
[real Web/TUI command parity](../../apps/canvas/src/app/selectionStyleParity.dom.test.ts)
and [terminal Inspector](../../examples/terminal-canvas/src/inspector.test.ts) verify
blank/link semantics, history, view isolation and native file round trips.

[`selection/commands`](src/selection/commands.ts) also owns row/column bounds and
edge/content-boundary navigation for both Hosts. Content-run navigation iterates
occupied intervals, independent of empty coordinate distance. Presentation accepts
a viewport clip; point membership uses the same coverage with a one-cell clip.
Full materialized Session operations validate work before allocating coverage.
[Navigation tests](src/selection/navigation.test.ts), [clipping tests](src/selection/coverage.test.ts)
and [cross-Host intents](../../apps/canvas/src/app/selectionNavigationParity.dom.test.ts)
verify bounds, wide followers, sparse gaps, extension and history isolation.

`SynchronousCommitBoundary` coalesces nested command publication and rejects
async mutation transactions in both Host compositions.

[`editor-input`](../editor-input/src/index.ts) connects the binding catalog to
`@opentui/keymap`; matching, precedence and sequences run outside this core.
Its [integration tests](../editor-input/src/engine.test.ts) cover command routing
and configuration updates; [browser tests](../editor-input/src/browser.dom.test.ts)
cover input guards and keyboard layouts.

`ClipboardPort.write()` distinguishes `written`, `dispatched`, `unavailable`
and `failed`. A dispatch has no acknowledgement from the user's clipboard:
Copy reports that state, while Cut preserves its source and history until a
`written` result. See the [contract and workflow](src/clipboard/commands.ts)
and [regressions](src/clipboard/commands.test.ts).

`EditorRuntime<State, Event>` is the extension framework. `FreeformEditorSession`
defaults to one in-memory document, local interaction/viewport state and a
command registry. Web retains its application facade, slide/session extensions,
persistence, collaboration wiring and legacy migration adapter.

`FreeformEditorSession(source, options)` accepts a caller-owned Registry, an
existing initial address, and Editor extensions. Injected content/history are
retained; disposing the Session releases its subscriptions and extensions without
disposing that Registry. Registry transactions and address changes publish into
the Session. Address changes cancel gestures and pending paste and restore local
interaction, viewport, input context and tool for the destination. Dirty state
covers every page; saving an inactive document never marks the active document
saved. [Workspace tests](src/workspace.test.ts) and
[composition tests](src/composition.test.ts) verify isolation, ownership and
remote Yjs updates.

[`documentText`](src/documentText.ts) owns the Canvas `document/v2` metadata codec:
document/page identities, descriptors, original origins and ordered anchors.
Active-page text starts in the envelope body; other page sources occur once in
metadata. Distant sparse content uses coordinate fragments rather than allocating
its empty bounding box. Unknown schemas and invalid metadata are rejected. Old v1 files load
at their original text origin `(0, 0)`. See [fidelity tests](src/documentText.test.ts)
and [cross-Host verification](../../apps/canvas/src/domains/canvas/state/nativeDocument.dom.test.ts).

[`viewState`](src/viewState.ts) validates serializable per-page interaction,
viewport, tool and typing context; restoration never mutates content or history.
[View tests](src/viewState.test.ts) verify isolation and malformed-input rejection.
Session `autoAnchors` commits prepared headings with pasted content; range moves
update affected anchors in the same undoable command.

[`search`](src/search.ts) owns literal, RE2 and spatial template matching for both
Hosts; Web's former implementation is a re-export. Search is read-only and uses
Cell coordinates. [Web search tests](../../apps/canvas/src/domains/canvas/searchSurface.test.ts)
verify matching and resource limits.

Hosts translate native input into commands and pointer events, provide
`ClipboardPort`, and render the [CellPlane](../cell-plane/README.md) projection.
A range-move preview hides source spans and overlays target spans without changing
the document or history. Commit writes one move; cancel restores prior interaction.

[`selection/coverage`](src/selection/coverage.ts) owns physical selection spans,
areas, membership and their bounding envelope. Wide graphemes expand each row
independently; the envelope is not a hit target. Copy, fill, deletion and movement
consume that coverage. [`selection/presentation`](src/selection/presentation.ts)
resolves committed, append and move previews for both Hosts; Web projects polygons,
Terminal paints spans. Move plans carry translated coverage alongside their patch.
[Coverage tests](src/selection/coverage.test.ts) and
[native cell-attribute tests](../../examples/terminal-canvas/src/selection-parity.test.ts)
verify whole graphemes, envelope holes and clipped tails.

The shared [pointer controller](src/interaction/controller.ts) owns selection
commit decisions from gesture anchor and release coordinates. Visual preview
caches never determine the committed target. A press inside coverage stays pending
until the move threshold; releasing below it places the active cell. Shift uses
the document selection anchor, not tool-local state. Hosts execute the decision
and retain their cancellation/history adapters. See [gesture tests](src/interaction/session.test.ts)
and [Web commit parity](../../apps/canvas/src/widgets/canvas-editor/hooks/interaction/gestures/selectionCommitParity.test.ts).

[`interaction/edgeScroll`](src/interaction/edgeScroll.ts) owns edge proximity,
drag eligibility, dwell/acceleration and cancelled-frame fencing. Hosts supply
the scheduler, viewport units and camera/pointer delivery. Web retains pixel
velocity; TUI accumulates integer cells and replays the same pointer commands.
[Shared timing tests](src/interaction/edgeScroll.test.ts),
[Web adapter tests](../../apps/canvas/src/widgets/canvas-editor/engine/CanvasEdgeScrollManager.dom.test.ts)
and [native lifecycle tests](../../examples/terminal-canvas/src/edgeScroll.test.ts)
verify scheduling, cancellation and range-move commit behavior.

Clipboard IO is asynchronous; mutation transactions remain synchronous. Cut
requires a successful write and unchanged target/payload. Paste requires an
unchanged target. A shared `ClipboardRequestScope` makes newer Cut/Paste requests
supersede pending predecessors, including per-event Web adapters. Hosts supply an `isActive` lifetime check so a disposed editor
cannot receive a pending mutation. `ClipboardPort` decides which formats and
transports the platform supports; the core starts no files, sockets, browser
storage or collaboration transport.

The [adversarial session suite](src/runtime.adversarial.test.ts) checks Unicode
chunking, interrupted gestures, clipboard races, reentrant publication and 12
seeded edit/undo traces. [Web traces](../../apps/canvas/src/domains/canvas/state/sharedEditorCore.adversarial.test.ts)
compare both Hosts after each command for eight more seeds. Failures include the
seed and command prefix; use the package test runner's `-t 'seed N'` to replay.
[Native probes](../../examples/terminal-canvas/src/interaction.adversarial.test.ts)
exercise OpenTUI input with and without Kitty keyboard reporting; clipboard IO
uses controlled promises and never touches the system clipboard.

An optional `prepareText` function prepares external text before a synchronous
clipboard mutation. `commands.pasteProvided(text)` and transported Paste both
return pending commands, use one request scope and validate the target after IO
and compilation. `autoAnchors` accepts a boolean or a Host preference reader; changes affect the next paste without reconstructing the Session. Prepared rich data bypasses text compilation. Preparation
failure returns `prepare-failed`; successful diagnostics are exposed in the
Session snapshot. Syntax/compiler dependencies remain in the Host. See
[preparation race tests](src/pastePreparation.test.ts) and the
[terminal compiler adapter](../../examples/terminal-canvas/src/text.ts).

[`drawing/`](src/drawing/planner.ts) owns Freeform geometry, collision/background
planning and rectangular foreground recolor. Both Hosts use these planners;
Web utility paths are facades. [Cross-Host drawing tests](../../apps/canvas/src/app/drawingParity.dom.test.ts)
verify final Cells and undo against real document commands.

The shared interaction port accounts for stroke work and includes the final
release coordinate. `FreeformEditorSession` keeps drawing previews outside the
document and commits one patch on release; cancellation restores interaction and
typing context. [`limits`](src/drawing/limits.ts) owns coordinate/work bounds;
[gesture tests](src/drawing/session.test.ts) cover limits, wide graphemes, rollback
and page isolation. Drawing settings belong to per-page views and use the existing
validated recovery contract. `commands.insertRows(rows, at)` synchronously inserts
prepared content through the same write/selection path used by rich paste.

[Package scripts](package.json) own build/test commands. The root
[architecture guard](../../scripts/check-domain-boundaries.mjs) rejects Web,
React, OpenTUI and platform IO imports in shared editor packages.

## Export preparation

[`exportPlan.ts`](src/exportPlan.ts) owns copied cell snapshots, text/native
preparation and raster allocation limits. Web/TUI own delivery, font resolution
and raster contexts. Whole native export retains the supplied document/pages;
selection native export retains absolute positions and selected text anchors.
TXT/ANSI bound dense work before serialization; native sparse documents keep the
existing fragment codec. Raster layout tries scale 2 then 1, bounded to 8192 per
edge and 16,777,216 pixels before canvas allocation. Empty documents retain a
serializable native/text representation.

The range policy is explicit: `coverage` includes whole selected graphemes and
excludes holes (TUI clipboard/files); `envelope` retains the Web PNG snapshot's
existing rectangular capture. Both expand wide glyph boundaries before capture.
Text padding continues to follow CellPlane's exporter. Shared
[preparation tests](src/exportPlan.test.ts), [Web raster tests](../../apps/canvas/src/domains/export/raster.dom.test.ts)
and [native delivery tests](../../examples/terminal-canvas/src/export.test.ts)
verify the contract.

[`clipboard/rich.ts`](src/clipboard/rich.ts) owns the existing custom MIME, legacy
JSON validation and portable HTML carrier. Hosts write `text/plain` and
`text/html` together, prefer validated native data on read, and fall back to text
preparation for unrelated/invalid HTML. No HTML is evaluated. The parser bounds
payload/cell counts and validates coordinates, graphemes, attributes and styles.
A confirmed plain fallback carries `plain-fallback`; Cut still requires a
confirmed write and an unchanged target. See [codec tests](src/clipboard/rich.test.ts)
and [command lifecycle tests](src/clipboard/commands.test.ts).
