# @chardesk/font-xiaolai

Private optional Xiaolai Mono resource pack for CharDesk; not published to npm.
It exports family/source metadata, `fonts.css`, and `manifest.json`.

The [manifest](manifest.json) owns the pinned official v3.126 source checksum and
generated asset checksums. FontTools partitions the original 22,199,284-byte TTF
into five non-overlapping WOFF2 `unicode-range` shards. Runtime loading uses only
packaged URLs and requests the shards needed by rendered graphemes.

The original SIL OFL 1.1 license is retained beside the generated fonts. Font
selection remains `xiaolai-mono`; this package changes distribution, not document
state, Cell geometry, glyph routing, or the regular-only overdraw policy.

Consumption and resource commands: [font guide](../fonts/README.md#xiaolai-mono-workspace).
