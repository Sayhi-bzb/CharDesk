# Shared character library

`@chardesk/character-library` owns pack normalization, character/name matching,
Unicode facet paging and resource caching for Web and Terminal.

[`CharacterLibrary`](src/index.ts) accepts a `CharacterResourcePort` for JSON
loading, optional name-search workers and cooperative yielding. It loads packs
on demand, reads at most four shards concurrently and retains eight shards.
Failed resource promises can retry. Results preserve the dataset's `insertable`
flag; the Host decides how to present and disable those entries.

The [generator](../../scripts/data/generate-character-data.mjs) owns datasets in
`apps/canvas/public/data/characters`. Web serves them through its browser adapter;
the [terminal runner](../../examples/terminal-canvas/scripts/run.ts) copies that
single source into the built distribution. Transport, workers, query generations
and visible state remain Host responsibilities.

- [Catalog, pagination, cache and retry tests](src/index.test.ts)
- [Web state adapter](../../apps/canvas/src/domains/character-library/stores/useLibraryStore.ts)
- [Terminal resources and picker](../../examples/terminal-canvas/src/characters.ts)
- [Terminal query/target races](../../examples/terminal-canvas/src/characters.test.ts)

[Package scripts](package.json) own build and test commands.
