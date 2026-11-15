# Which TUI consistency gaps did the audit expose?

Status: **four confirmed gaps repaired by the [consistency migration](CONSISTENCY-PLAN.md)**.
This audit extends the [quality matrix](../../examples/terminal-canvas/QUALITY.md).
State ownership remains defined by the
[state authority contract](../../apps/docs/content/docs/development/architecture/state-authority.mdx);
local content transactions remain defined by [Runtime transactions](../local-runtime/TRANSACTIONS.md).

## Executable counterexamples

Run from the repository root:

```sh
npm run audit:architecture --workspace @chardesk/terminal-canvas-demo
```

The [audit probes](../../examples/terminal-canvas/src/architectureProbes.ts)
uses isolated files, a real serialization worker and native OpenTUI input parsing.
It emits JSON per invariant and exits nonzero for unresolved failures. It is an
explicit diagnostic command and also run in the
[default regression gate](../../examples/terminal-canvas/src/architectureContracts.test.ts).

2026-11-14: the original run had **four invariant failures, no setup failures**;
after migration all four pass. The findings below describe the pre-migration state.

| Probe | Observed failure | Owning implementation |
| --- | --- | --- |
| `content-history-independence` | A supported local `history: 'none'` write changes cells and content version, but `dirty` stays false. | [Session dirty identity](../editor-core/src/runtime.ts) |
| `save-acknowledges-only-captured-content` | Save captures X; a local unrecorded write makes live content B. Disk contains X, live cells contain B, but save acknowledges the Session as clean. | [Capture](../local-runtime/src/documentSerialization.ts), [save acknowledgement](../local-runtime/src/document.ts), [dirty identity](../editor-core/src/runtime.ts) |
| `dismissed-close-cannot-commit-later` | Start Close with a paused save; press Escape and dismiss the modal; finish the save. The Canvas still closes. | [Close UI](src/workspaceControls.ts), [session close](../local-runtime/src/sessions.ts) |
| `closing-freezes-all-input-channels` | During closing, Settings rejects typed keys but accepts bracketed paste into its Shortcuts input. | [Keyboard/paste routing](src/controller.ts), [Settings input](src/settingsDialog.ts) |

The first two probes specifically use a local unrecorded write. They do not claim
that every ordinary keystroke or remote transaction bypasses dirty tracking. The
last probe demonstrates mutation of a modal field, not a proven document write.
No physical terminal forwarding or OS clipboard behavior is inferred from these runs.

## Pre-migration causes

### Content identity is only partially migrated

The Registry's content clock covers all tracked document mutations. However,
`FreeformEditorSession.versionAt` still combines page descriptors, history position
and a remote-change counter. `isDirtyAt` and `markSavedAt` use that older identity.
The serializer captures both identities, but ordinary save acknowledgement uses
only the older one. Autosave eligibility, reload guards and close eligibility
consume that dirty/version contract.

Changing Find and Style to use content versions fixed those consumers. It did not
repair persistence's source of truth. Another local check at each consumer would
repeat the same partial migration.

### Async ownership is not a complete operation contract

`LocalSessions` and `TerminalWorkspace` have separate global intent counters;
panels also use object identity, `busy`, `#alive` and input generations. Individual
operations decide which checks to apply. Dismissing the Close panel invalidates
opening intents, while `LocalSessions.close` never captures or checks that intent.
Consequently, presentation cancellation and domain completion disagree.

The existing synchronous content commit boundary provides atomic publication of
document edits. It does not automatically govern file bindings, close/archive
operations or presentation activation after IO.

### Input policy is distributed across channels and consumers

Keyboard, paste, pointer and direct command dispatch take different paths through
`controller.ts` and `surface.ts`. Closing is checked before modal keyboard routing,
but after Settings/Style paste routing. The earlier busy-prompt paste bug has the
same shape: one consumer or event channel enforces a rule another bypasses.

OpenTUI parsing and keymap matching already have owners. The missing layer is one
Host decision about which surface may receive which event in the current phase.

## Migration boundaries

| Boundary | Target responsibility | Reuse / constraint |
| --- | --- | --- |
| Content state and persistence acknowledgement | Shared core exposes content identity separately from history; local runtime owns the saved baseline for each file binding. A save acknowledges only its captured content and binding. Dirty projection, reload and close use the same contract. | Reuse Registry clocks, immutable captures, existing file baselines and the runtime journal. Do not add another document store. |
| Operation lifetime | An operation captures its owner, document/binding identity, relevant content version and cancellation lifetime. Preparation may await; publication revalidates the ticket once at the owning boundary. Durable IO outcome and presentation activation are separate outcomes. | Reuse the short synchronous commit model and existing activation-coordinator pattern. Nonabortable IO still requires a post-IO ownership check. |
| Host input ownership | One context resolves the active surface and its phase. Keyboard, paste, pointer and command enablement consult that policy. A surface handle owns its pending requests and releases them when dismissed. | Keep OpenTUI and `@opentui/keymap`; do not implement another parser or shortcut engine. |

Dirty cannot be replaced with a raw comparison of monotonic content versions:
Undo to the saved semantic state must still become clean. The migration must
define a saved semantic-state identity or verified snapshot equivalence, alongside
the monotonic token used to reject stale work. Yjs state vectors alone do not prove
equal content after deletions. History removal must not itself change content identity.

Cancellation also needs a defined commit point. Before publication, cancellation
prevents close/activation; after a durable write, its file may remain while
presentation activation is suppressed. A completed irreversible operation must be
reported as committed, not retroactively described as canceled.

## Implementation routing

The [consistency migration plan](CONSISTENCY-PLAN.md) owns module changes, ordering,
consumer cutovers and acceptance gates for these findings.

The original feature pass did not cover these contracts. The default test entry
now includes the original probes and the broader owning suites linked by the plan.
