# Terminal host

The interactive Bun host for `chardesk`. `runTerminal(args)` composes terminal input,
rendering and clipboard with the local runtime. The former demo source modules are
compatibility re-exports; tests remain in the example harness during migration.

[Interaction and verification](../../examples/terminal-canvas/README.md) owns terminal
behavior. [Local runtime](../local-runtime/README.md) owns files and live-instance routing.
