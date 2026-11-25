# Terminal host

The interactive Bun host for `chardesk`. `runTerminal(args)` composes terminal input,
rendering and clipboard with the local runtime. The former demo source modules are
compatibility re-exports; tests remain in the example harness during migration.

[Interaction and verification](../../examples/terminal-canvas/README.md) owns terminal
behavior. [Local runtime](../local-runtime/README.md) owns files and live-instance routing.
[TachyonFX bridge](tachyonfx/README.md) owns live read/write feedback, its WASM artifact
and rebuild/verification contracts.
[Quality coverage](../../examples/terminal-canvas/QUALITY.md) maps terminal contracts
to automated scenarios and device evidence.
[Architecture audit](ARCHITECTURE-AUDIT.md) records the original counterexamples
and their repaired owners. [Implementation plan](CONSISTENCY-PLAN.md) records the
migration and completion gates.

[`TerminalInputContext`](src/inputContext.ts) owns modal/floating focus and phase
admission for keyboard, paste, pointer and Host commands. CanvasSurface projects
its panel and closing state. Modal leases own operation signals; busy derives from
the current task. Hiding/dismissing a modal aborts its lease, and restoration creates
a fresh one. Widgets declare their command/paste targets and retain field/query
freshness checks. [Channel/phase contracts](../../examples/terminal-canvas/src/inputContext.test.ts)
and [native architecture probes](../../examples/terminal-canvas/src/architectureContracts.test.ts)
run in the default TUI test gate. Addressed agent writes remain independent of
human focus; terminal forwarding still requires device evidence.
