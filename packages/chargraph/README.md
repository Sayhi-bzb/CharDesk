# @chardesk/chargraph

CharDesk's source compiler. It transforms explicit text source kinds into
styled fragments and Protocol-laid-out rows without a DOM.

```ts
import {
  compileCharDeskText,
  materializeCompiledCharDeskText,
} from "@chardesk/chargraph";

const compiled = await compileCharDeskText(source, {
  sourceKind: "chargraph",
});
const document = materializeCompiledCharDeskText(compiled);
```

`chargraph` recognizes Markdown, Mermaid, fenced data, math, and block layout.
`chardesk` parses compiled ESC-less ANSI, `ansi` accepts terminal ANSI, and
`plain` preserves literal text. Hosts must select a kind explicitly; exported
CharDesk cells must not be reinterpreted as CharGraph source.

CharGraph emits diagnostics and source-aware fragments. `@chardesk/protocol`
alone owns grapheme segmentation, CJK width, tabs, and cell coordinates. See
[UPSTREAM.md](./UPSTREAM.md) for adapted renderer attribution.

Markdown results expose top-level `visualGroups` as half-open output row ranges
with an explicit inline alignment. Ordinary blocks request `start`; enhanced
tables and successfully rendered Mermaid diagrams request `center`. Block layout
applies that placement inside each intrinsic-width field instead of inferring
alignment from group membership.

Auto rendering activates block layout only after an unescaped `|||` field
boundary. Once active, `---` separates layout rows; without `|||`, it remains
Markdown. Callers that intentionally accept row-only layouts can opt into
`layout.activation: "any-boundary"`.
