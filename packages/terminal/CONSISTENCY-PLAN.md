# How will the TUI consistency gaps be repaired?

Status: implemented. The
[architecture audit](ARCHITECTURE-AUDIT.md) owns the findings and counterexamples.
This page owns migration order, module changes and completion gates. Existing
[ownership](../../apps/docs/content/docs/development/architecture/ownership.mdx)
and [Runtime transaction](../local-runtime/TRANSACTIONS.md) contracts remain authoritative.
The owning contracts are [core persistence](../editor-core/README.md),
[runtime lifecycle](../local-runtime/README.md), and [Host input](README.md).

| Stage | Delivered evidence |
| --- | --- |
| P1 | [Content/save contracts](../editor-core/src/persistenceState.test.ts), [worker captures](../../examples/terminal-canvas/src/documentSerialization.test.ts), [binding receipts](../../examples/terminal-canvas/src/consistencyLifecycle.test.ts) |
| P2 | [Operation scopes](../local-runtime/src/operations.test.ts), [lifecycle cancellation and independent owners](../../examples/terminal-canvas/src/consistencyLifecycle.test.ts) |
| P3 | [Input channels/phases and modal restoration](../../examples/terminal-canvas/src/inputContext.test.ts), existing Settings/Style/Workspace native suites |
| P4 | [Four probes in the default gate](../../examples/terminal-canvas/src/architectureContracts.test.ts); removed saved/history counters, global open-intent counters and assignable panel/busy authorities; verification index in [QUALITY](../../examples/terminal-canvas/QUALITY.md) |

## Target boundaries

**Native input adapters** → **Host input context** → **Operation lifetime** → **Domain commit**  
　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　↓  
　　　　　　　　　　　　　　　　　　　　　　 **Content identity / saved baseline**

| Owner | Responsibility | Existing implementation to retain |
| --- | --- | --- |
| `editor-core` | Content versions, semantic content identity, history facts and synchronous document publication | Registry, CellPlane, semantic history and commit boundaries |
| `local-runtime` | File binding and saved baseline, IO ordering, operation preparation/commit checks and durable outcomes | CanvasFile/FileSourceBinding, serializer worker, journal and session ownership |
| `terminal` + `editor-input` | Surface ownership, input admission and projection of operation status | OpenTUI parsing, keymap engine/catalog, current renderer and dialog shell |

One document authority remains. View focus is not a precondition for an agent's
addressed content write. Human surface admission and runtime request admission
have distinct owners; shutdown coordinates them through the existing endpoint pause/drain.

## P0 — Turn the findings into contract gates

The four [audit probes](../../examples/terminal-canvas/src/architectureProbes.ts)
now run in the normal test entry and the standalone diagnostic command. Both must
pass; assertions are unchanged. Owning contract tests cover semantic identity,
operation lifetime and input admission beyond those original counterexamples.

Create three fixtures: immutable save capture with controllable completion;
runtime operations paused at prepare/commit boundaries; normalized events across
surface phases. These control actual ports and boundaries, rather than monkey-patching
unrelated timing or duplicating the implementation's conditions.

## P1 — Content identity and save acknowledgement

### Contract

Use distinct types for `ContentVersion`, `HistoryPosition` and `SemanticContentId`.
They cannot be passed interchangeably to acknowledgement or concurrency APIs.

- `ContentVersion`: the existing monotonic document clock, used for freshness checks.
- `HistoryPosition`: undo/redo bookkeeping; never sufficient proof that content is saved.
- `SemanticContentId`: identity of persisted document meaning, independent of Yjs
  storage history and undo retention.
- Saved baseline: owned by the existing file binding, including its incarnation,
  captured content version and semantic identity. Disk-source digest remains the
  optimistic conflict proof for the physical file.

Define semantic identity over ordered pages and their authored metadata, anchors,
and sparse cells including styles/links. Exclude viewport, selection, tools and
active-page focus. Catalog labels remain governed by catalog persistence. Declare
any other serialized metadata explicitly before implementation; do not hash raw
Yjs updates, a state vector or arbitrary JSON property order.

### Implementation

1. Add the canonical semantic projection contract in `editor-core`; enumerate all
   mutation origins, including local unrecorded writes, remote updates and history replay.
2. Extend the existing serializer worker to produce a semantic digest alongside
   its captured version/source. Reuse native decoding and sparse traversal; hash
   canonical records with the existing platform hashing facilities. Cache by document
   incarnation/content version and coalesce requests. No whole-document scan runs
   synchronously for each input event.
3. Extend CanvasFile/FileSourceBinding's baseline rather than introducing another
   mutable save store. A receipt acknowledges the captured snapshot at the captured
   binding. Rebinding, retirement or a newer live edit cannot turn that edit clean.
   Shared core defines a file-agnostic read port for persistence state; the runtime
   supplies the binding's projection. Core must not import local runtime or keep a
   second copy of its saved baseline. File-free tests use an in-memory port adapter.
4. Derive `needsSave`/dirty from this contract. An unknown equivalence is conservatively
   dirty while a coalesced comparison runs. A result for an older content version
   cannot clear the current dirty state. Preserve the common Undo-to-saved fast path
   only when retained history and mutation-origin facts prove the lineage; otherwise
   compare semantic identity. History reset/trimming must invalidate such hints.
5. Migrate normal save, autosave retries, reload checks, close eligibility, recovery
   and Duplicate together. `FreeformEditorSession`'s existing dirty APIs become
   projections of the new persistence contract where used; remove the old competing
   baseline after both callers and tests have migrated. Reconcile Web consumers
   explicitly rather than changing their dirty semantics incidentally.

Primary files: [runtime.ts](../editor-core/src/runtime.ts),
[Registry](../editor-core/src/CanvasDocumentRegistry.ts),
[history](../editor-core/src/CanvasHistoryJournal.ts),
[serialization](../local-runtime/src/documentSerialization.ts),
[worker](../local-runtime/src/document-worker.ts),
[file](../local-runtime/src/document.ts),
[workspace](../local-runtime/src/workspace.ts),
[autosave/recovery](../local-runtime/src/persistence.ts).

Gate: all content origins become eligible for persistence; a save never acknowledges
uncaptured content; Undo back to a saved semantic state becomes clean; view changes
and history maintenance do not create content changes. Sparse-coordinate and input
latency baselines must retain their existing bounds; record worker/digest costs separately.

## P2 — Runtime operation lifetime

Add a runtime operation ticket containing owner, operation ID, addressed document
incarnation, file binding incarnation, cancellation signal and operation-specific
freshness requirements. Scope replacement to that owner; avoid one global UI
generation shared by unrelated clients.

The runtime runs preparation outside a synchronous commit. Its commit entry checks
the ticket and domain preconditions. `AbortSignal` assists cancellation; post-await
validation remains required for IO that cannot be aborted. Results distinguish
failure/cancellation, durable effects already produced and presentation activation.

| Operation | Commit condition / cancellation outcome |
| --- | --- |
| Save | Historical capture may reach disk while typing continues; acknowledge that capture, retaining later edits as dirty. Validate binding/ownership and disk baseline. |
| Close / Archive | Revalidate ticket, binding and save eligibility immediately before closing or changing catalog state. A canceled prepare may save data, but cannot later close/archive. |
| Open | Register durable results separately from activation. Only the current owner's activation ticket may change its active view. |
| Duplicate | Capture one source snapshot. Cancellation may retain a written copy; suppress stale activation/rebinding. Do not accidentally acknowledge the original's live contents. |
| Reload | Require the captured base content version and binding at replacement. If preservation succeeds but reload is stale/canceled, retain the preserved copy and report that outcome. |

Migrate [LocalSessions](../local-runtime/src/sessions.ts),
[workspace file operations](../local-runtime/src/workspace.ts), then
[WorkspaceControls](src/workspaceControls.ts), clipboard/export and resource tasks.
Panel identity may still guard presentation updates; it no longer substitutes for
domain cancellation or commit validation. Once all callers use tickets, retire the
superseded global intent counters and per-operation cancellation branches.

Gate: pause each operation at its await boundaries, then cancel, switch/retire the
target, change content or disconnect its owner. No stale domain commit or presentation
activation follows. Unrelated clients continue working. Post-commit cancellation
cannot relabel a completed irreversible effect as uncommitted.

## P3 — Host input ownership

Add one surface/context owner in the terminal host. A context exposes its input
target and phase (`ready`, `busy`, `closing`, `disposed`); a surface handle owns its
pending input/operation lifetime. Modal push/pop and floating focus changes use
that owner. CanvasSurface consumes its panel/focus projection instead of exposing
independently assignable ownership state.

All keyboard, paste, pointer and Host-command entry points consult one admission
policy. Native adapters remain separate. The policy determines consume/dispatch
and target; widgets implement editing behavior only. Application actions such as
Quit retain explicit scope/phase rules. Busy status is projected from the current
operation rather than maintained as a second independent lock.

Migrate [controller](src/controller.ts), [surface](src/surface.ts), then Settings,
Shortcuts, Style, menus and workspace panels. Retain OpenTUI/keymap parsing,
matching and user bindings. Remove the duplicated modal/closing guards only after
each migrated consumer passes the shared admission tests.

Gate: key/paste/pointer/direct Host command obey the same phase policy. Closing and
disposed surfaces admit no editing; busy forms accept no new edits or old paste
results. Dismissal prevents click-through and releases focus and pending requests.
External agent document commands remain independent of the human modal focus.

## P4 — Cutover and cleanup

| Check | Required result |
| --- | --- |
| Architecture counterexamples | Four pass in the default CI gate; no separate permanently red audit |
| Save contracts | Recorded/merged/unrecorded/remote writes, Undo/Redo, history clearing/trimming; mutations during capture/write/acknowledgement; rebinding and recovery |
| Operation contracts | Cancellation and target changes at await boundaries for every migrated lifecycle operation; independent owners; shutdown and committed outcomes |
| Input contracts | Channels × surface phases, including nested modals, floating controls, resize and focus recovery |
| Existing regressions | TUI, shared core/input/runtime, affected Web parity, built CLI/PTY, types and architecture checks pass |
| Removed mechanisms | No remaining alternate dirty authority, obsolete global UI intent arbitration or duplicated input-admission policy |

Deliver P1, P2 and P3 as complete contract migrations with their consumer cutovers,
not an abstraction-only change followed by indefinite dual paths. Keep the current
document format and runtime journal schema unless a demonstrated recovery requirement
needs a migration. Physical terminal forwarding remains a separate device-evidence
requirement; these changes must not claim to solve swallowed terminal shortcuts.
