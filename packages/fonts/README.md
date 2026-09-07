# @chardesk/fonts

Core font capabilities for CharDesk Canvas: JuliaMono symbol fallback, Symbols Nerd Font Mono, monochrome Noto Emoji, capability routing, and the profile factory. Cell width remains owned by `@chardesk/protocol`.

## Install

```sh
npm install @chardesk/fonts
```

```ts
import "@chardesk/fonts/fonts.css";
import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  createCharDeskFontProfile,
} from "@chardesk/fonts";

const profile = createCharDeskFontProfile({
  id: "product/display-v1",
  display: { families: { regular: "'Product Latin', monospace" } },
  cjk: { families: { regular: "'Product CJK', monospace" }, scaleX: 1.2 },
});
```

`CHARDESK_SYSTEM_FONT_PROFILE` uses the platform monospace stack for display/CJK and packages the core `nerd`, `symbol`, and `emoji` fallbacks. Box Drawing and Block Elements (`U+2500–U+259F`) use the independent `cell-glyph` capability. `createCharDeskFontProfile({ cellGlyph })` defaults that face to `display`. `withCharDeskCoreCellGlyphs(profile)` selects `CHARDESK_CORE_CELL_GLYPH_FACE` (JuliaMono Regular) and enforces the structural-character classifier while preserving other routes. Cell UI and the main Canvas Host consume this helper. Other symbols keep their `symbol` capability but resolve through display, CJK, then JuliaMono. Nerd and emoji retain their dedicated Core face first. A display package contributes only face and source metadata; it does not bundle the core fonts.

JuliaMono is shipped as eight non-overlapping `unicode-range` subsets. The full
11,191-code-point coverage remains available, while a page downloads only the
subsets required by its rendered graphemes. The vendoring pipeline checks that
every upstream code point belongs to exactly one declared subset before writing
the package.

Symbols Nerd Font Mono is pinned with the matching official 3.5.1 glyph catalog.
Its 10,617 code points are assigned to semantic families such as Material,
Font Awesome, Codicons, and Powerline, then oversized families are split until
every WOFF2 shard is at most 96 KiB. CSS ranges, runtime capability ranges, and
the character explorer are generated from that same catalog. Use
`npm run fonts:sync:nerd` to refresh this independently from the other pinned
Core sources; `npm run fonts:verify -- --target=canvas-core` is offline.

The current optional compatibility display is [`@chardesk/font-maple`](../font-maple/README.md). Source versions and checksums are authoritative in `manifest.json`; candidate evaluation lives in the [font capability research card](../../exp/research/font-stack.md).

Font assets retain their upstream licenses beside each family. Package code is MIT licensed.

## Ark Mono workspace

[`@chardesk/font-ark`](../font-ark/README.md) is a private optional resource pack.
The Gallery consumes `ARK_FONT_FAMILY` / `ARK_FONT_SOURCES` and imports
`@chardesk/font-ark/fonts.css?url` with Vite, attaching the stylesheet only when
selected. It awaits font loading and grid measurement before committing the
switch; failure preserves the current font and offers retry.

The font stays at 15px with regular-only weight; its `12px` name is the upstream
design size. Maple's source and the Cell metric algorithm are unchanged.
Use `npm run fonts:sync -- --target=ark` to vendor the pinned release (requires
`unzip`), and `npm run fonts:verify -- --target=ark` for offline verification.
See [package scripts](../../package.json) for the command authority.

## Grid calibration

`display.cellMetrics` optionally overrides `width`, `height`, and `baseline`, in
em of the effective display size. Omitted fields keep measured defaults. It
changes grid geometry, not glyph outlines; Surface explicit metrics take
precedence. Font line height need not equal a tileable grid height.

For a regular face with validated 15px compact rows and a 12.5px baseline at
15px font size, use `{ height: 1, baseline: 5 / 6 }`. Validate text overhang and
border joins together using the [font audit](../rendering/README.md#font-grid-audit).
A seamless repeated border may still overhang individual Cells; clipping and
fallback coverage remain separate host concerns.

## Weight capability

Declare `weightPolicy: "regular"` on a face with no supported bold weight to
decline Cell bold requests, including browser synthetic bold. The default
`"inherit"` follows Cell bold and selects `families.bold ?? families.regular`.
The policy applies to the entire capability stack, including fallbacks, not
just its first family. See the [Canvas resolution contract](../rendering/README.md)
for host overrides and loading.

The factory's display-first `symbol` capability inherits the display face's
weight policy; dedicated Nerd and emoji stacks remain regular-only.
