# How is the Terminal Canvas verified?

This page owns TUI quality coverage and evidence boundaries. Behavior belongs to
the [Host contract](README.md), storage to [WORKSPACE.md](WORKSPACE.md), and shared
read/write semantics to [Runtime transactions](../../packages/local-runtime/TRANSACTIONS.md).
Scope is the shipped local Freeform host, including human/agent access. Slides,
presence UI and cloud collaboration are outside this stage.

Stage status (2026-11-14): the automated L1–L4 gates below passed. Physical L5
verification remains unavailable for the reasons recorded below.

The [architecture audit](../../packages/terminal/ARCHITECTURE-AUDIT.md) exposed four
further gaps across persistence, cancellation and input ownership. The
[consistency migration](../../packages/terminal/CONSISTENCY-PLAN.md) repaired their
owners. All four now pass in the [default gate](src/architectureContracts.test.ts)
and `audit:architecture`; [input phases](src/inputContext.test.ts),
[operation scopes](../../packages/local-runtime/src/operations.test.ts),
[binding/lifecycle outcomes](src/consistencyLifecycle.test.ts) and
[semantic persistence](../../packages/editor-core/src/persistenceState.test.ts)
cover the broader contracts.

## Evidence levels

| Level | Evidence | Does not establish |
| --- | --- | --- |
| L1 | Shared core/adapter contracts and independent state oracles | Host routing or presentation |
| L2 | OpenTUI native parser, hit testing, focus, composed frames and controlled lifetimes | Physical terminal forwarding |
| L3 | Emitted VT output replayed through a terminal grid, including fragmented packets | Real terminal font/palette/configuration behavior |
| L4 | Built CLI on a POSIX PTY, independent client processes, files and restart | Physical shortcuts, OS clipboard or browser launch |
| L5 | Physical input and device behavior in an identified terminal environment | Other versions, settings, platforms or multiplexers |

Passing L1–L4 never upgrades an L5 claim. Automated tests inject clipboard/IO
services and use temporary homes; they do not alter user documents or terminal
configuration. The PTY runner requires Python 3 and POSIX `pty`/`termios`.

## Coverage matrix

P0 protects content integrity and input ownership. P1 protects complete workflows
and presentation. Entries identify executable coverage, not a blanket claim that
every OS/terminal combination works. Each execution must pass its referenced suite.

| Priority / dimension | Contract | Executable evidence | Remaining boundary |
| --- | --- | --- | --- |
| P0 Input and capability fallback | [Input policy](README.md#terminal-input-policy) | [Policy](src/terminalPolicy.test.ts), [modifiers](src/inputModifiers.test.ts), [range input](src/range-input.test.ts), [raw keys](src/surface.test.ts), [Host attachment](src/inputHost.test.ts) — L1/L2 | L5 forwarding matrix below |
| P0 Focus and event ownership | [Workspace controls](README.md#workspace-controls) | [Dock](src/dock.test.ts), [Settings](src/settingsDialog.test.ts), [Shortcuts](src/shortcutsDialog.test.ts), [Style](src/inspector.test.ts), [menus](src/contextMenu.test.ts), [lifetimes](src/hostLifetimes.test.ts) — L2; [PTY](scripts/acceptance.py) — L4 | Physical focus transitions require L5 |
| P0 Gesture recovery | [Range input](README.md#range-input), [edge scroll](README.md#continuous-edge-scrolling) | [Adversarial interactions](src/interaction.adversarial.test.ts), [interrupt sequences](src/interactionSequences.test.ts), [edge scroll](src/edgeScroll.test.ts), [PTY resize/help](scripts/acceptance.py) — L2/L4 | Missing physical events remain subject to input policy |
| P0 Editing, clipboard and history | [Clipboard](README.md#export-and-rich-clipboard), [shared commands](../../packages/editor-core/README.md) | [Model](src/model.test.ts), [tools](src/tools.test.ts), [clipboard transport](src/clipboard.test.ts), [independent sparse oracle](src/interactionSequences.test.ts), [Unicode workflow](src/unicodeWorkflow.test.ts) — L1/L2 | OS rich interoperability and OSC 52 acceptance need L5 |
| P0 Unicode and coordinates | [Host limits](README.md#verification-and-limits) | [Text](src/text.test.ts), [selection parity](src/selection-parity.test.ts), [Unicode workflow](src/unicodeWorkflow.test.ts), [wide selection output](src/selectionOutput.test.ts), [glyph output](src/glyphOutput.test.ts) — L1–L3 | Physical fonts/grid policies need L5 |
| P1 Rendering, colors and links | [Appearance](README.md#terminal-appearance), [links](README.md#links) | [Appearance](src/appearance.test.ts), [Welcome](src/welcomeAppearance.test.ts), [links](src/links.test.ts), [VT transition replay](src/incrementalOutput.test.ts), [footer](src/footer.test.ts) — L2/L3 | Physical theme notifications and browser opening need L5 |
| P1 Search, navigation and anchors | [Navigation](README.md#selection-and-navigation) | [Workspace flows](src/workspaceControls.test.ts), [Minimap](src/minimap.test.ts), [navigation parity](../../apps/canvas/src/app/selectionNavigationParity.dom.test.ts) — L1/L2 | Source observation/reload also covered below |
| P1 Drawing and content insertion | [Tools and templates](README.md#drawing-characters-and-templates), [text input](README.md#text-input) | [Tools/templates](src/workspaceControls.test.ts), [character resources](src/characters.test.ts), [template dataset](src/templates.test.ts), [auto paste/CharGraph](src/text.test.ts), [render profile](src/textSettings.test.ts) — L1/L2 | Compiler/resource failure and late completion must retain targets |
| P1 Export and snapshots | [Export](README.md#export-and-rich-clipboard) | [Delivery and file races](src/export.test.ts), [PNG preparation](src/snapshot.test.ts), [PNG clipboard guards](src/contextMenu.test.ts) — L1/L2 | Native image clipboard needs L5; file export is independently checked |
| P1 Configuration, localization and panels | [Settings](README.md#settings), [Style](README.md#style-toolbar) | [Settings storage](src/settings.test.ts), [rebinding](src/keymapSettings.test.ts), [i18n](src/i18n.test.ts), [dialogs](src/settingsDialog.test.ts), [Style](src/inspector.test.ts), [Shortcuts](src/shortcutsDialog.test.ts) — L1/L2 | Recording a binding does not prove forwarding |
| P1 Distribution update presentation | [Distribution port](../../packages/terminal/src/updates.ts) | [Status/settings interactions](src/viewStatus.test.ts), [distribution service](../../packages/cli/src/updates.test.ts) — L1/L2 | Network responses, clipboard delivery and release-note opening are injected |
| P0 Canvas/session lifecycle | [Session storage](WORKSPACE.md), [controls](README.md#workspace-controls) | [Session service](src/localSessions.test.ts), [Session panel](src/sessionControls.test.ts), [removal](src/sessionRemoval.test.ts), [workspace](src/workspace.test.ts), [async target lifetime](src/hostLifetimes.test.ts) — L1/L2 | File deletion and record removal keep separate confirmations |
| P0 Persistence and external changes | [Recovery](WORKSPACE.md), [transactions](../../packages/local-runtime/TRANSACTIONS.md) | [Files](src/document.test.ts), [serialization](src/documentSerialization.test.ts), [source observation](src/fileSource.test.ts), [reload UI](src/sourceControls.test.ts), [crash recovery](src/persistence.test.ts), [durable versions/retries](src/contentPersistence.test.ts) — L1/L2/L4 | No silent overwrite or automatic replay of unknown execution |
| P0 Human/agent interleaving | [Transactions](../../packages/local-runtime/TRANSACTIONS.md) | [Atomic preparation/races](../../packages/local-runtime/src/capabilities.test.ts), [independent live clients](src/localCapabilities.test.ts), [PTY human/agent/restart](scripts/acceptance.py) — L1/L4 | One local owner; no claim of cloud collaboration |
| P1 Performance and resource lifetime | [Sparse frame](../../packages/cell-core/src/frame.ts), [Host lifecycle](../../packages/terminal/src/controller.ts) | [Sparse render baseline and full detach cycles](src/hostLifetimes.test.ts), [Minimap cache](src/minimap.test.ts), [PTY exit modes/signals](scripts/acceptance.py), [trace privacy](src/inputTrace.test.ts) — L1/L2/L4 | Timing is a measured baseline, not a cross-device latency SLO |

## Continuous scenarios

[Interaction sequences](src/interactionSequences.test.ts) use three fixed seeds
under legacy and Kitty input. An independent coordinate→character map checks every
edit; draining undo/redo must restore the initial/final contents. Failures include
the seed, protocol and event prefix. Replay one seed with:

```sh
TUI_SEQUENCE_SEED=42 bun examples/terminal-canvas/scripts/run.ts test -t 'sparse editing sequence'
```

The same suite crosses range creation, range movement and Hand pan with Escape,
blur, focus return, tiny resize, Help, Settings, context menu and tool changes.
Late release followed by an ordinary click must leave one cursor, no gesture,
no selection and unchanged content/version/history.

[Host lifetimes](src/hostLifetimes.test.ts) delay preparation until after a document
switch, modal/menu opening or detach. Both documents and their versions must stay
unchanged. Reattaching the complete controller 25 times must release its event
subscriptions, commands and panels, and dispatch each Quit only once.

[Workspace regressions](src/workspaceControls.test.ts) also cover cancelled
Duplicate publication, content changes outside undo history, visible clipboard
failures and stale failure isolation. [Copy publication tests](src/workspace.test.ts)
cancel after the copy reaches disk and verify that the original stays bound and
dirty. [Style regressions](src/inspector.test.ts) reject a color edit after an
unrecorded content change. These consumers use document content versions rather
than undo-history versions; [input traces](src/inputTrace.test.ts) retain the same
distinction without recording document text.
Busy path prompts reject both direct terminal paste and late clipboard results;
submitting an operation invalidates older input requests even if that operation
fails and leaves the prompt open.

[Unicode workflow](src/unicodeWorkflow.test.ts) selects through an emoji follower,
previews and commits a move, styles, copies, cuts, undoes, pastes at negative
coordinates, redoes and reopens the native file. Checks cover cells, selection,
history, rich payloads and persisted content. Device clipboard IO is injected.

[VT transitions](src/incrementalOutput.test.ts) compare the composed frame with the
terminal grid after replaying seven-byte chunks of actual output. Selection,
menus, Settings, Help, Style, Minimap, pan, deletion and undo must not leave stale
glyphs. Existing [glyph](src/glyphOutput.test.ts) and
[selection](src/selectionOutput.test.ts) output tests also check wide-cell coverage.

[Built PTY acceptance](scripts/acceptance.py) checks human input alongside an
independent agent, stale-write rejection, retry deduplication, persistent versions
and reopen. A second scenario covers Help input isolation, an interrupted drag,
tiny resize, resumed editing and SIGTERM. Both check terminal mode and alternate
screen cleanup. CLI output is drained during requests to avoid PTY backpressure.

## Reusable gates

From the repository root:

```sh
npm test --workspace @chardesk/terminal-canvas-demo
npm run test:pty --workspace @chardesk/terminal-canvas-demo
npm run typecheck --workspace @chardesk/terminal-canvas-demo
npm test --workspace @chardesk/editor-core
npm test --workspace @chardesk/editor-input
npm test --workspace @chardesk/local-runtime
```

The [verification planner](../../scripts/quality/verification.mjs) runs the TUI and
PTY scripts in the products lane for affected PR/full checks. Quick checks retain
the native suites; run `test:pty` explicitly when inspecting executable behavior.
[Planner tests](../../scripts/quality/verification.test.ts) protect that routing.
The [CI workflow](../../.github/workflows/ci.yml) owns runner configuration.

The sparse baseline prints one JSON record containing runtime/platform/architecture,
80×24 viewport, 1,000 distant anchors, 30 rendered frames, p50/p95 duration and RSS.
Assertions bound frame dimensions and visited output, and protect unchanged
content/history and listener cleanup. They do not prove internal algorithmic
complexity. RSS is contextual process usage, not evidence of a leak or its absence.
Compare timings on the same machine/runtime; do not relax correctness tests to
accommodate a performance regression.

## Physical terminal evidence

Current stage environment: macOS 27.0 (26A428), arm64, Warp installed/running. On 2026-11-14,
Computer Use refused access to `dev.warp.Warp-Stable` for safety reasons. No physical
input was sent and no terminal configuration or system clipboard was changed.
Warp version/configuration could not be inspected. L5 remains **unverified**.

| Path | Required device evidence | Status |
| --- | --- | --- |
| macOS / direct Warp | Option+click, Shift+arrows, Option+four arrows, Hand drag; Command copy forwarding or the advertised fallback; rich OS clipboard; OSC 8 click; palette change | Unverified: app access denied |
| macOS / Ghostty or Kitty | Forwarded modifiers/Command, requested/refused Shift capture where applicable, clipboard/link/theme behavior | Unverified: no device run |
| Linux terminal | Physical Control bindings, pointer/focus, clipboard and terminal restoration | Unverified: no device run |
| Windows terminal | Native clipboard, filesystem/keyboard semantics and resize/exit | Unverified: POSIX PTY is not Windows evidence |
| SSH / tmux / other multiplexer | Capability boundary, remote clipboard fallback and modifier forwarding | Unverified: no device run |

For each device run, record OS, terminal version, forwarding-related settings,
direct/SSH/multiplexer path, scenario and observed outcome. Use the opt-in
[input trace](README.md#terminal-input-policy) when distinguishing a swallowed
event from an application routing defect. Do not mark an unavailable shortcut
as supported merely because its encoded event passes L2.
