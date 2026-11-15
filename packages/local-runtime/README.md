# Local runtime

Owns local document files, session catalog, claims, persistence and live-instance routing.
The storage contract remains documented in [WORKSPACE](../../examples/terminal-canvas/WORKSPACE.md).
The [shared read/write contract](TRANSACTIONS.md) owns content concurrency and verification.

`executeLocal(name, input, target)` accepts a canonical Canvas operation and an explicit
file or session target. Live owners receive authenticated loopback requests; unopened
files use a temporary workspace with the same catalog claims. Writes are not replayed
after a dispatched request loses its connection. Undo requires a live owner.

`startLocalEndpoint(paths, workspace, sessions)` publishes private instance metadata
under `<state>/runtimes`, bounds in-flight requests and removes discovery metadata on shutdown.
Preparation runs independently; synchronous version-checked commits order content changes.
The endpoint belongs to the editor process; no always-on daemon is required.

## Agent activity

Identified outer content calls produce one inbox record per invocation; preparation
inside Code does not create additional records. Completion updates that record.
`agents.sqlite` stores identity, operation, outcome and acknowledgment revisions,
separately from content versions, request deduplication and undo. Identified calls
also retain input JSON and, when supplied by the CLI, its argument vector. Lists
load metadata only; details load a single call's payload. History has no inactivity expiry.

The CLI captures arguments before routing and input before `sourceRef`/`scriptRef`
resolution. Unchanged input crosses IPC once, not as a duplicate payload. Formatting
for copying preserves argument boundaries; original shell quoting, pipelines,
environment variables and referenced file contents are not captured. Schema-one
records migrate with unread state intact and have no invented call details.

Acknowledgments name the Canvas, record ID and rendered revision. An unseen later
revision stays unread. Dead owners become interrupted records when the inbox
reopens; a live owner's work is preserved. Inbox failures are advisory and never
change a content operation's result. Product behavior belongs to the
[terminal manual](../../apps/docs/content/manual/terminal.mdx#agents).

Implementation: [registry](src/agents.ts), [storage](src/agentInboxStore.ts).
Verification: [store and recovery](../../examples/terminal-canvas/src/agentInbox.test.ts),
[IPC, details and rendered acknowledgment](../../examples/terminal-canvas/src/agents.test.ts),
[command formatting](../../examples/terminal-canvas/src/agentActivityFormat.test.ts).

`canvas_read` uses the [shared read pipeline](../canvas-capabilities/README.md)
for text, Cells, PNG and both. Reads and searches return a detached snapshot's
opaque content `version`. A live TUI supplies its current terminal palette;
headless reads, or a terminal without resolved RGB, use the shared light palette.
Native font resolution is shared with TUI image export and loads only for image IO.

Use `baseVersion` for read/modify/write and `requestId` for retryable mutations.
The [content contract](TRANSACTIONS.md) defines conflicts, commit/persistence
receipts, isolated Code preparation, request replay and recovery targets.
[`LocalCanvasStore`](src/canvasStore.ts) owns the runtime journal at the
[storage-policy location](../../examples/terminal-canvas/WORKSPACE.md#application-directories).

Current local limits: Freeform only; OS clipboard access from Code is unavailable.
Browser lifecycle remains owned by the Web host.
Code lifecycle changes run outside transactions; each Code undo runs separately
from writes. Verification is indexed by the content contract above.

[`CanvasFile`](src/document.ts) owns its saved baseline through the
[core persistence port](../editor-core/src/persistenceState.ts). The existing
[serializer worker](src/documentSerialization.ts) returns immutable source, content
proof and semantic digest. A save receipt acknowledges that capture only at its
original binding/document incarnation. Disk digests still guard external changes.
[Capture tests](../../examples/terminal-canvas/src/documentSerialization.test.ts)
and [binding/lifecycle tests](../../examples/terminal-canvas/src/consistencyLifecycle.test.ts)
cover the distinction.

[`OperationCoordinator`](src/operations.ts) scopes pending operations by owner.
`run` releases unfinished tickets on failure; synchronous `commit` revalidates
cancellation and binding guards. Completed disk effects remain in cancellation
outcomes. LocalSessions and workspace file operations share this coordinator;
agent lifecycle requests have independent owners and register copies without
activating the human view. Startup removal repair runs before a workspace exists
and must finish its durable journal. See [operation contracts](src/operations.test.ts)
and [lifecycle regressions](../../examples/terminal-canvas/src/consistencyLifecycle.test.ts).

Open prepares/registers the addressed file before `commitOpen` publishes activation.
Registered files can exist without an active canvas: `workspace.active` is optional;
`requireActive()` is for operations that require one. Host editing eligibility
uses the active binding, rather than inferring it from `files.length`.
