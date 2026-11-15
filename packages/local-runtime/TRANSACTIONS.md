# How do local Canvas clients share reads and writes?

Contract for one human TUI and multiple local agent clients. The
[storage contract](../../examples/terminal-canvas/WORKSPACE.md) owns files,
claims, baselines and recovery; this page owns content concurrency.

## Ownership

TUI input and agent CLI/IPC operations converge on one Canvas Runtime per owned
document. Runtime reuses `editor-core`/CellPlane; it does not introduce another
document store. TUI retains viewport, selection, tool and dialog state. Agent
content operations must not adopt or settle that state.

Runtime initially lives in the TUI process. An unopened target uses a temporary
runtime with the same contract and catalog claim. A daemon, online presence,
task assignment and region-level merge are outside this contract. The separate
[agent activity inbox](README.md#agent-activity) records identified calls separately;
it is advisory and never changes document versions or persistence.

## Read and commit contract

- `read` captures a detached projection and opaque document-wide `version`
  synchronously, before image rendering or other asynchronous work. Search uses
  the same capture. Later mutations cannot change that response's snapshot.
- Content versions are independent of undo capture, dirty/saved versions and
  SQLite session-record revisions. Every content transaction invalidates earlier
  tokens, including undo, redo, ignored-history and remote writes on inactive
  pages. View changes and history maintenance do not. Persist version identity
  with content so reopening unchanged content retains its token. External file
  edits or replacement must invalidate it rather than trust an old stored token.
- A mutation names its Canvas, `baseVersion` and `requestId`. Check the version
  before preparation and again at synchronous commit. Report an addressed
  conflict rather than overwrite intervening work. Whole-document checks suffice
  initially. No client may force a write by bypassing the commit authority.
- Prepare expensive compilation and Code batches against isolated snapshots.
  Publish one complete synchronous change, or none. A failed script cannot roll
  back intervening human edits. Successful synchronous commits define each
  Canvas's order; preparation can run concurrently and does not reserve an arrival-order slot.
- Repeating a request ID with the same request returns its recorded outcome;
  reusing it with different input is an error. Persist retry records with a
  recoverable relationship to content so restart cannot replay a committed write.
- Receipts distinguish content commit from persistence, identify the resulting
  version and advertise undo only when history remains available. Saving failure
  leaves committed content readable and dirty; it does not claim durability.
- Addressed content notifications invalidate client views. Clients read a fresh
  snapshot to obtain content; notifications are not a second document store.

## Implementation and verification

| Step | State | Authority / evidence |
| --- | --- | --- |
| Separate content generations and detached read snapshots | Implemented | [`CanvasDocumentRegistry`](../editor-core/src/CanvasDocumentRegistry.ts), [clock/snapshot tests](../editor-core/src/contentVersion.test.ts), [`localCapabilities`](src/capabilities.ts) |
| Unified patch commit authority, version preconditions and independent preparation | Implemented | Registry `commitContentPatchAt`, [primitive races and cross-Canvas preparation](src/capabilities.test.ts), [IPC](src/ipc.ts); human commands use the same Registry mutation port |
| Isolated Code batches and human interaction protection | Implemented | [Code preparation/commit](src/codeTransaction.ts), [failure and concurrent-human tests](src/capabilities.test.ts); lifecycle changes are outside Code transactions, one undo per call |
| Persistent versions, retry identity and save recovery | Implemented | [Runtime journal](src/canvasStore.ts), [session binding](src/sessions.ts), [native version/retry/recovery tests](../../examples/terminal-canvas/src/contentPersistence.test.ts), [checkpoint SIGKILL verification](../../examples/terminal-canvas/src/persistence.test.ts) |
| TUI/CLI integration and concurrent-client acceptance | Implemented | [Live two-client conflicts, duplicate requests and human-view preservation](../../examples/terminal-canvas/src/localCapabilities.test.ts), [headless read/write, post-commit SIGKILL and request replay](../../examples/terminal-canvas/src/contentPersistence.test.ts) |

Live callers may supply `baseVersion` alongside operation parameters; the local
adapter removes it before shared tool-schema validation. An omitted precondition
captures the version at request acceptance, protecting asynchronous preparation
but not a read/modify/write sequence across requests. Such clients must roundtrip
the read token. Digest-verified version records retain tokens across temporary
CLI runtimes without changing the native document format.

`requestId` is optional for one-shot mutations; callers needing retry safety must
provide it. It is scoped to Canvas identity and accepts 1–128 ASCII letters,
digits, dots, underscores, colons or hyphens. Fingerprints include the operation,
resolved input and explicit precondition, independent of JSON property order.
Reservations are durable before dispatch. Concurrent duplicates join; completed
results are retained without automatic expiry. A missing result after owner death
is `execution_unknown`, not permission to replay. Inspect content before choosing
a new ID. Transport loss also never triggers an automatic fallback write.

`version` identifies the committed content; `persistedVersion` identifies the
snapshot saved to disk. Serialized snapshots are retained before replacement.
Candidate digest/version records are written before rename and confirmed after
durable publication. Recovery matches actual file bytes to the candidate/current
record. An unchanged baseline restores pending content and its token; a conflict
creates a managed recovery copy before discarding the recovery record. Checkpoints
retain their content token separately from view state and catalog revisions.

Completion requires races between real human editor commands and independent
agent calls: stale writes, concurrent agents, edits during preparation, batch
failure, repeated requests, save failures and reopening. Existing serial request
routing alone does not prove these properties.

## Boundary verification

| Boundary | Evidence |
| --- | --- |
| Compound undo/redo publishes one final snapshot and native transaction | [Core content tests](../editor-core/src/contentVersion.test.ts): compound history; subscriber edits remain separate from agent history |
| A closed/reopened file handle cannot receive a prepared write | [Local capability tests](src/capabilities.test.ts): retired target; no content/version/save changes |
| Native file or parent directory is missing | [Native persistence tests](../../examples/terminal-canvas/src/contentPersistence.test.ts): separate recovery target; original request is not applied to it; interactive startup opens recovery |
| Recovery publication or cleanup is interrupted | Same native suite: resume the persisted copy ID, preserve both sources, retain one copy |
| Recovery binding overlaps autosave or shutdown | Same native suite: save waits for restoration, pending branches survive, reopening retains the saved token, shutdown drains binding before releasing claims |
| Owner dies before a result is recorded, including after a saved commit | Same native suite and [crash fixture](../../examples/terminal-canvas/src/fixtures/committedRequestCrash.ts): `execution_unknown`, unchanged saved version, no replay |
| Changes during persistence retain newer dirty content | [Native save](../../examples/terminal-canvas/src/document.test.ts) and [exit/save ordering](../../examples/terminal-canvas/src/persistence.test.ts) |

A missing original with pending edits returns `canvas_recovered` and
`recoveredCanvasId`. CLI callers explicitly choose that copy; the original
mutation is not redirected. Interactive startup can open the recovered copy.
