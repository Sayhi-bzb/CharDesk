# What survives saving and restarting?

Native `.chardesk` files own document content. A separate workspace checkpoint
owns recovery snapshots and local views. The [shared codec](../../packages/editor-core/src/documentText.ts)
owns the Canvas metadata schema; [storage](src/storage.ts) owns atomic replacement.

| State                                                                      | Native document  | Workspace checkpoint                                 |
| -------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| Characters, styles, links, coordinates                                     | Yes              | Recovery snapshot                                    |
| Document/page identities, page descriptors, anchors                        | Yes              | Recovery snapshot                                    |
| Open paths, active document/page                                           | Active page only | Yes                                                  |
| Cursor, selection, camera, tool, drawing settings, typing context per page | No               | Yes                                                  |
| Undo/redo                                                                  | No               | No; isolated per document during the current process |

Legacy `document/v1` files remain readable at `(0, 0)`. Saving uses `document/v2`;
updated Web and Terminal Hosts preserve its metadata. Older clients reject v2
rather than silently dropping it. Ordinary pages remain readable character art;
large sparse bounds use text fragments with coordinates. Native Paste imports
active-page content only; Open preserves all pages and anchors.

## Save and recovery rules

The default checkpoint is `<first-file>.workspace.json`; `--workspace path`
chooses another. Its adjacent `.lock` permits one live process per checkpoint;
a dead process's lock is reclaimed at restart. Invalid checkpoints remain intact
and startup fails with an error. Use another checkpoint path to start separately.

[Persistence](src/persistence.ts) checkpoints edits and views on a 150 ms throttle.
After 800 ms of idle editing, it saves all dirty documents. Document close and
quit also save before removing documents or releasing the workspace. Manual Save
commands and disabling autosave are not exposed. `--snapshot` is
read-only and creates neither checkpoint nor lock. Recovery guarantees extend
to the last completed checkpoint, not every incoming keystroke.

Saves check the disk baseline before writing and again before replacement.
Detected external modifications stop the save and appear as errors in the UI.
Duplicate requires an unused path and preserves the original. This is optimistic
conflict detection, not an OS lock against unrelated writers.

Restart compares the disk file, saved baseline digest and recovery snapshot:

| Disk state                          | Result                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Unchanged baseline                  | Restore checkpoint content and views                                        |
| Snapshot already saved before crash | Restore as clean                                                            |
| Changed disk, clean checkpoint      | Open current disk content with a fresh view                                 |
| Changed disk, dirty checkpoint      | Keep external file; recover edits at a separate `.recovered-…chardesk` path |

An invalid external document is left untouched; its dirty snapshot still gets a
separate recovery path. Quit saves all open documents, including hidden dirty
documents. Failed document or checkpoint writes keep the editor open, preserving
recovery data. Signals also attempt to save before releasing the workspace.

[Workspace](src/workspace.ts) captures document addresses for asynchronous saves
and rejects late navigation intents. Each document keeps separate history and
interaction; file paths are canonicalized so aliases do not open duplicates.
Drawing/catalog previews and pending searches are transient; recovery restores
the selected tool and complete drawing settings, never an unfinished stroke or
placement.

Checkpoint, lock and already-open paths cannot become Duplicate destinations.

## Verification

- [Native fidelity](src/document.test.ts) and [Web round trips](../../apps/canvas/src/domains/canvas/state/nativeDocument.dom.test.ts)
- [Isolation and asynchronous saves](src/workspace.test.ts)
- [Recovery, external edits, locking, save-on-close and real SIGKILL](src/persistence.test.ts)
- [Rendered panels and native keyboard/pointer events](src/workspaceControls.test.ts)

Windows filesystem durability and terminal shortcut forwarding still require
validation on their native environments; the tests exercise platform key policy
and controlled clipboard ports without changing the OS clipboard.
