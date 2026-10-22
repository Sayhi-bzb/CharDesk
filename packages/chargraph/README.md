# @chardesk/chargraph

CharDesk's source compiler. It produces source-aware fragments, diagnostics, and
Protocol-laid-out rows without a DOM.

```ts
import {
  compileCharDeskText,
  materializeCompiledCharDeskText,
} from "@chardesk/chargraph";

const compiled = await compileCharDeskText(source, { format: "auto" });
const document = materializeCompiledCharDeskText(compiled);
```

`format` accepts `auto`, `plain`, `ansi`, `markdown`, and `chardesk`; `raw` aliases
`plain`. `normalizeCharDeskTextRequest` resolves legacy `sourceKind` and
`chargraphMode` options; explicit `format` takes precedence. Legacy `chargraph`
selects Auto unless `chargraphMode` overrides it.

[Text rendering rules](../../apps/docs/content/docs/development/architecture/text-rendering-pipeline.mdx)
own format selection, literal protection, ANSI composition, and retired layout
behavior. [UPSTREAM.md](./UPSTREAM.md) owns adapted renderer attribution.

`@chardesk/protocol` owns grapheme widths, tabs, and coordinates. Existing
Protocol-only hosts can use synchronous `compileCharDeskProtocolText`; its
`protocolSyntax` option preserves the Viewer's existing syntax policy without
activating Markdown. Native document parsing precedes text compilation.

Markdown results expose top-level `visualGroups` as half-open output row ranges:
ordinary blocks request `start`; enhanced tables and rendered Mermaid request
`center`. Hosts decide how to place these groups.
