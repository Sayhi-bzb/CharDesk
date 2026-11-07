# Local runtime

Owns local document files, session catalog, claims, persistence and live-instance routing.
The storage contract remains documented in [WORKSPACE](../../examples/terminal-canvas/WORKSPACE.md).

`executeLocal(name, input, target)` accepts a canonical Canvas operation and an explicit
file or session target. Live owners receive authenticated loopback requests; unopened
files use a temporary workspace with the same catalog claims. Writes are not replayed
after a dispatched request loses its connection. Undo requires a live owner.

`startLocalEndpoint(paths, workspace, sessions)` publishes private instance metadata
under `<state>/runtimes`, serializes calls and removes discovery metadata on shutdown.
The endpoint belongs to the editor process; no always-on daemon is required.

`canvas_read` uses the [shared read pipeline](../canvas-capabilities/README.md)
for text, Cells, PNG and both. A live TUI supplies its current terminal palette;
headless reads, or a terminal without resolved RGB, use the shared light palette.
Native font resolution is shared with TUI image export and loads only for image IO.

Current local limits: Freeform only; OS clipboard access from Code is unavailable.
Browser lifecycle remains owned by the Web host.
Verification: [live routing and persistence](../../examples/terminal-canvas/src/localCapabilities.test.ts).
