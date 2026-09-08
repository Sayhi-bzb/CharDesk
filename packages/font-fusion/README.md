# @chardesk/font-fusion

Private workspace resource pack for the Web TUI Gallery; not published to npm.
Exports family/source metadata, `fonts.css`, and `manifest.json`. Gallery owns
the regular-only profile and Maple fallback; Core does not depend on this pack.

The [manifest](manifest.json) owns the pinned official release, archive checksum,
and asset checksums. The unmodified Latin-variant WOFF2 includes CJK glyphs;
`Latin` identifies the glyph variant, not an ASCII subset. The release's Fusion,
Ark Pixel, Cubic 11, and Galmuri licenses are retained beside the font. Runtime
loading uses only packaged URLs, never GitHub, third-party CSS, or an installed
`local()` face.

At 15px, ASCII advances 7.5px; CJK and sampled `│█▀▄─┌└→` advance 15px.
The symbols therefore overrun a one-Cell slot. The Gallery keeps Unicode
rendering and visible overflow; this resource does not rescale these glyphs.
The font audit records the mismatch rather than treating all glyphs in a font
named Mono as one-Cell compatible.

Consumption and resource commands: [font guide](../fonts/README.md#fusion-mono-workspace).
Browser regressions read this same asset through
[the test helper](../../e2e/helpers/fusion-mono.ts); there is no separate test font.
