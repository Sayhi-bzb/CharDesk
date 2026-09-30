# Legacy Blackboard migration

Private compatibility compiler for retired Blackboard source.
Do not use it for new authoring or expose source-editing tools.

Browser and CLI migration compile `blackboard/v1` spatial manifests and
`blackboard/v2` Slide manifests into native `.chardesk` documents.
[Compiler](src/compiler.ts), [browser adapter](src/source-tree.ts),
[filesystem adapter](src/package.ts), and their adjacent tests own conversion.

[Retirement contract](../../apps/docs/content/docs/development/architecture/blackboard-retirement.mdx)
owns data retention and migration lifecycle.
