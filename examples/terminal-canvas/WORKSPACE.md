# What survives saving and restarting?

Native `.chardesk` files own document content. The local SQLite catalog owns
session identity and discovery; a workspace checkpoint owns open files, recovery
snapshots and local views. The [shared codec](../../packages/editor-core/src/documentText.ts)
owns document metadata; [storage](src/storage.ts) owns atomic replacement.

**F7 Sessions** → [LocalSessions](src/sessions.ts) → **open Workspace** → shared Editor Session\
　　　　　　　　　├→ [SQLite catalog](src/sessionCatalog.ts): identity, alias, path, archive\
　　　　　　　　　└→ **native document files** ← autosave\
　　　　　　　　　　　　↑ [workspace checkpoint](src/persistence.ts): restart recovery

## Application directories

[AppPaths](src/appPaths.ts) owns the platform policy. Interactive startup creates
private directories; help and snapshots create no application data or locks.

| Root   | macOS                                    | Linux                       | Windows                         |
| ------ | ---------------------------------------- | --------------------------- | ------------------------------- |
| Config | `~/Library/Preferences/chardesk`         | `$XDG_CONFIG_HOME/chardesk` | `%APPDATA%/chardesk/Config`     |
| Data   | `~/Library/Application Support/chardesk` | `$XDG_DATA_HOME/chardesk`   | `%LOCALAPPDATA%/chardesk/Data`  |
| State  | `<Data>/state`                           | `$XDG_STATE_HOME/chardesk`  | `%LOCALAPPDATA%/chardesk/State` |
| Cache  | `~/Library/Caches/chardesk`              | `$XDG_CACHE_HOME/chardesk`  | `%LOCALAPPDATA%/chardesk/Cache` |

Unset or relative XDG roots use `~/.config`, `~/.local/share`, `~/.local/state`
and `~/.cache`; Windows falls back to the corresponding `~/AppData` directories.
An absolute `CHARDESK_HOME` replaces these roots with `<home>/{config,data,state,cache}`.

| Artifact           | Location                                | Override           |
| ------------------ | --------------------------------------- | ------------------ |
| Preferences        | `<Config>/terminal.json`                | `--settings path`  |
| Session catalog    | `<Data>/catalog.sqlite`                 | `CHARDESK_HOME`    |
| Managed canvases   | `<Data>/canvases/<session-id>.chardesk` | `CHARDESK_HOME`    |
| Default checkpoint | `<State>/workspaces/default.json`       | `--workspace path` |

Cache is disposable and currently has no required contents. Keep data and state
on a local filesystem with working SQLite and atomic-file locking semantics.

Preferences retain the version-1 envelope: `values` owns scalar terminal choices,
`shortcuts` owns EditorKeymap user overrides, and `textProfile` owns shared rendering
configuration without a duplicate mode field. Paste format in `values` remains
the TUI mode authority; CLI overrides remain session-only. See the
[Settings contract](README.md#settings) and [persistence tests](src/settings.test.ts).

## Session identity and lifecycle

A session UUID is independent of document/page IDs, its name and file path.
Renaming changes only the catalog alias, including for external files. Managed
files keep UUID filenames. External paths are canonicalized, registered once and
saved in place. Closing removes an open editor; archiving additionally hides its
catalog entry. Neither operation deletes content. Duplicate captures current
unsaved content in a fresh managed file with a fresh document ID. Undo history
stays isolated while open and does not survive close or process restart.

The catalog uses Bun's built-in SQLite with schema version 3, incremental writes
and revision checks for metadata changes. New creation commits a `creating` row
with its native snapshot before writing the file; `ready` clears that snapshot.
Startup retries interrupted creation. Conflicting file content and its creation
snapshot both remain intact. Unknown, future or corrupt catalogs are never reset.
Versions 1/2 migrate in place, preserving sessions and pending deletion journals.

Separate checkpoints can share a catalog. Transactional per-path ownership permits
one writable CharDesk instance per canonical path in that catalog. Living owners
have no timeout; dead PIDs can be reclaimed. Every save verifies its ownership
before writing and replacing a file; per-claim tokens fence old guards. Separate
application homes and unrelated editors rely on the disk-baseline conflict checks
below. The default checkpoint itself remains exclusive.

### Removing sessions

Sessions → X distinguishes **Remove session record — keep file** from **Delete
managed file and session record**. Cancel is selected initially. Both paths save
and close an open editor first; a save failure or stale confirmation retains data.
External files, symlinks, directories and paths outside the managed canvas directory
never receive a file-delete action. Record removal keeps every file.

Managed deletion verifies the catalog revision, writer ownership and confirmed
file identity/bytes before staging it under `<Data>/deletions`. A durable SQLite
journal records preparation and the catalog removal commit. Startup rolls back
prepared work or finishes committed cleanup; it never overwrites a replacement
at the original path. Ambiguous files remain with a recoverable path and a warning.
Sessions → X can retry interrupted removal.

Catalog removal retains a session-identity tombstone. Checkpoints capture that
identity; stale snapshots cannot resurrect a removed session. Older checkpoints
without identities use path tombstones. Explicitly opening a retained file creates
a new session identity and permits its new checkpoints to restore normally.

[Removal regressions](src/sessionRemoval.test.ts) cover interruption, replacement,
cross-process ownership, schema migration and stale-checkpoint recovery;
[native panels](src/sessionControls.test.ts) verify the confirmation choices.

## Document and view state

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

The checkpoint's adjacent `.lock` permits one live process per checkpoint;
a dead process's lock is reclaimed at restart. Invalid checkpoints remain intact
and startup fails with an error. Use `--workspace path` for a separate workspace;
it still uses the same session catalog unless `CHARDESK_HOME` changes.

[Persistence](src/persistence.ts) checkpoints edits and views on a 150 ms throttle.
After 800 ms of idle editing, it saves all dirty documents. Document close and
quit also save before removing documents or releasing the workspace. Manual Save
commands and disabling autosave are not exposed. `--snapshot` is
read-only and creates neither checkpoint nor lock. Recovery guarantees extend
to the last completed checkpoint, not every incoming keystroke.

Saves check the disk baseline before writing and again before replacement.
Detected external modifications stop the save and appear as errors in the UI.
Duplicate preserves the original. Baseline checks provide optimistic conflict
detection against writers outside the shared catalog.

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
recovery data. SIGINT/SIGTERM also attempt to save before releasing the workspace.

[Workspace](src/workspace.ts) captures document addresses for asynchronous saves
and rejects late navigation intents. Each document keeps separate history and
interaction; file paths are canonicalized so aliases do not open duplicates.
Drawing/catalog previews and pending searches are transient; recovery restores
the selected tool and complete drawing settings, never an unfinished stroke or
placement.

Application storage, checkpoint and lock paths cannot be opened as external
canvases. Explicit settings paths are reserved by the interactive composition.

## Native file sources

A [`FileSourceBinding`](src/fileSource.ts) owns each native path's accepted content
and digest. Observations never mutate the document or advance that baseline.
[Monitoring](src/sourceMonitor.ts) checks metadata every two seconds and reads content
when it changes; focus/manual checks always verify content. It coalesces pending reads, and releases subscriptions/timers on detach. Newer inspections or
accepted writes/reloads supersede older asynchronous results.

[`TerminalWorkspace`](src/workspace.ts) serializes explicit reload with saving.
It parses the incoming native document and rereads its bytes before replacement;
changed targets, newer local edits, missing/invalid files and stale reads preserve
the editor. Successful reload retains the runtime document identity and page
views (mapping the old active view when page IDs change), clears content history,
and accepts the new baseline without rewriting the file. Local edits require a
confirmed independent managed copy before replacement. Cancellation or a later
edit retains that copy and cancels reload. Failed saving can be retried from
Source after resolving the disk conflict.

Verification: [binding races](src/fileSource.test.ts),
[reload state retention](src/workspace.test.ts), [native controls](src/sourceControls.test.ts)
and [local-copy recovery](src/localSessions.test.ts).

## Legacy data

With no new checkpoint and no explicit `--workspace`, startup checks the known
`<first-file>.workspace.json`, or `terminal-canvas.chardesk.workspace.json` in the
launch directory. It locks and validates that checkpoint before copying it to the
new location. It never searches unrelated directories or deletes the original.
Explicit paths take precedence over restored active-document navigation.

When neither `CHARDESK_HOME` nor `--settings` is supplied, an absent preferences
file can read the former `terminalSettingsPath()` location. The next setting change
writes the new location; existing new preferences win. Originals remain untouched.

## Verification

- [Directory policy](src/appPaths.test.ts), [catalog ownership and recovery](src/localSessions.test.ts), [startup and migration](src/localWorkspace.test.ts), [session panels and empty state](src/sessionControls.test.ts)
- [Native fidelity](src/document.test.ts) and [Web round trips](../../apps/canvas/src/domains/canvas/state/nativeDocument.dom.test.ts)
- [Isolation and asynchronous saves](src/workspace.test.ts)
- [Recovery, external edits, locking, save-on-close and real SIGKILL](src/persistence.test.ts)
- [Rendered panels and native keyboard/pointer events](src/workspaceControls.test.ts)

Windows filesystem durability and terminal shortcut forwarding still require
validation on their native environments; the tests exercise platform key policy
and controlled clipboard ports without changing the OS clipboard.
