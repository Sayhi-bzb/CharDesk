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

Current local limits: Freeform only; image reads and OS clipboard access from Code
are unavailable. Browser lifecycle and image adaptation remain owned by the Web host.
Verification: [live routing and persistence](../../examples/terminal-canvas/src/localCapabilities.test.ts).
