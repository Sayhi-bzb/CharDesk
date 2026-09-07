# @chardesk/font-ark

Private workspace resource pack for the Web TUI Gallery; not published to npm.
Exports family/source metadata, `fonts.css`, and `manifest.json`. Gallery owns
the regular-only profile and Maple fallback; Core does not depend on this pack.

The [manifest](manifest.json) owns the pinned official release, archive checksum,
and asset checksums. The unmodified Latin-variant WOFF2 includes CJK glyphs;
`Latin` identifies the glyph variant, not an ASCII subset. The upstream OFL
license is retained beside the font. Runtime loading uses only packaged URLs,
never GitHub, third-party CSS, or an installed `local()` face.

At 15px, ASCII advances 7.5px; CJK and sampled `│█▀▄─┌└→` advance 15px.
The symbols therefore overrun a one-Cell slot. This is also present in the
official 2026.08.11 font, not a new 09.01 metric regression. The Gallery keeps
Unicode rendering and visible overflow; this resource migration does not
rescale these glyphs. The font audit records the mismatch rather than treating
all glyphs in a font named Mono as one-Cell compatible.

Consumption and resource commands: [font guide](../fonts/README.md#ark-mono-workspace).
Browser regressions read this same asset through
[the test helper](../../e2e/helpers/ark-mono.ts); there is no separate test font.
