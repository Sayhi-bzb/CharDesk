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
  cjk: { families: { regular: "'Product CJK', monospace" } },
});
```

`CHARDESK_SYSTEM_FONT_PROFILE` uses the platform monospace stack for display/CJK and packages the core `nerd`, `symbol`, and `emoji` fallbacks. Box Drawing and Block Elements (`U+2500–U+259F`) use the independent `cell-glyph` capability. `createCharDeskFontProfile({ cellGlyph })` defaults that face to `display`. `withCharDeskCoreCellGlyphs(profile)` selects `CHARDESK_CORE_CELL_GLYPH_FACE` (JuliaMono Regular) and enforces the structural-character classifier while preserving other routes. This helper remains available for font-only consumers. Canvas surfaces bypass fonts for the exact 778-character [Cell graphics registry](../rendering/README.md#cell-graphics), including registered Powerline, Braille, Progress, Git Branch, and Legacy symbols. Unregistered symbols keep their normal capability route. A display package contributes only face and source metadata; it does not bundle the core fonts.

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

Nerd glyphs remain one protocol Cell and use `fontSizeScale: 0.8`. The scale is
uniform: font profiles cannot stretch one axis independently. Glyph ink may
cross a Cell boundary; the containing Canvas Surface is the paint boundary.

The current optional compatibility display is [`@chardesk/font-maple`](../font-maple/README.md). Source versions and checksums are authoritative in `manifest.json`; candidate evaluation lives in the [font capability research card](../../exp/research/font-stack.md).

Font assets retain their upstream licenses beside each family. Package code is MIT licensed.

## Fusion Mono workspace

[`@chardesk/font-fusion`](../font-fusion/README.md) is a private optional resource pack.
The Gallery consumes `FUSION_FONT_FAMILY` / `FUSION_FONT_SOURCES` and imports
`@chardesk/font-fusion/fonts.css?url` with Vite, attaching the stylesheet only when
selected. It awaits font loading and grid measurement before committing the
switch; failure preserves the current font and offers retry.

The font stays at 15px with regular-only weight; its `12px` name is the upstream
design size. Maple's source and the Cell metric algorithm are unchanged.
Use `npm run fonts:sync -- --target=fusion` to vendor the pinned release (requires
`unzip`), and `npm run fonts:verify -- --target=fusion` for offline verification.
See [package scripts](../../package.json) for the command authority.

## Xiaolai Mono workspace

[`@chardesk/font-xiaolai`](../font-xiaolai/README.md) is the optional Xiaolai
Mono display/CJK pack. Consumers import `XIAOLAI_FONT_FAMILY` /
`XIAOLAI_FONT_SOURCES` and attach `@chardesk/font-xiaolai/fonts.css?url` only
when selected. The CSS partitions v3.126 into base, CJK Extension A, CJK
Unified, Hangul, and supplementary-plane WOFF2 ranges; rendered graphemes select
the required files without application-owned shard routing.

Generated assets and the OFL are committed. `npm run fonts:sync --
--target=xiaolai` reproduces them with pinned FontTools through `uvx`; set
`PYFTSUBSET` only to override that executable. `npm run fonts:verify --
--target=xiaolai` verifies the package offline.

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

`boldStrategy` is normalized when a Profile is created. `display` and `cjk`
default to `auto`: a declared `families.bold` selects `native`; otherwise the
renderer selects `overdraw`. `cell-glyph`, `symbol`, `nerd`, and `emoji` default
to `none`. The browser is never asked to synthesize bold for `overdraw` or
`none`.

`overdraw` repeats the regular glyph at `boldOverdrawEm`, defaulting to `1/15em`
(one CSS pixel at the default 15px size). `native` requires `families.bold`.
`weightPolicy` remains a deprecated profile-input compatibility field and is
normalized immediately. See the [Canvas resolution contract](../rendering/README.md)
for drawing, loading, and audit behavior.
