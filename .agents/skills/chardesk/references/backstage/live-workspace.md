# Live workspace backstage

Use this context when `chardesk_blackboard_*` tools are available. WebMCP and
ChatGPT Site Tools expose the same workspace contract.

1. Work in the active Blackboard. Create one for a new scene; open an existing
   workspace only when the intended target is not already visible.
2. List the source graph, read `blackboard.yaml` first, then read the visible
   Panels involved in the change.
3. Batch related writes and deletes in one patch. Use `baseRevision` only when
   guarding against concurrent edits.
4. Read `projectionStatus`, `sourceGraph`, and warnings from the mutation, then
   check the workspace. An unchanged projection routes the next edit through
   `blackboard.yaml` rather than another standalone file.
5. Creation and opening activate the Canvas; subsequent file calls omit
   `workspaceId`.
6. Report changed paths and the resulting revision.

A revision conflict refreshes the source and recomputes one patch. A repeated
conflict ends the mutation attempt. A missing workspace may be resolved through
one workspace listing.

Edit canonical source files rather than rendered cells. When available, use
[Canvas read](live-canvas.md) to inspect the final projection before choosing a
change and after checking the workspace. It complements file reads; it does not
recover source or replace `check`. Runtime tool definitions own operation names
and schemas.
