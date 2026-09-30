# @chardesk/protocol

Parser and conformance data for [CharDesk Text Protocol v1](./spec/v1.md). The package converts plain ASCII/Unicode, standard ANSI, and ESC-less ANSI into rendering-neutral cells. It contains no DOM or renderer.

## Install

```sh
npm install @chardesk/protocol
```

## Parse

```ts
import { parseCharDeskText } from "@chardesk/protocol";

const document = parseCharDeskText(
  "[38;2;255;0;0m+---+[0m\n| 界 |",
  { defaultStyle: { color: "#111827" } }
);

for (const cell of document.cells) {
  // cell: { x, y, width, text, color?, bgColor?, attrs?, href? }
}
```

Use `document.source` when preserving ANSI copy and `document.plainText` or `stripCharDeskAnsi(source)` for plain-text copy.

Use `decodeCharDeskTextRuns(source)` when a higher-level renderer needs ANSI as
attributed text before another syntax transform. It returns normalized visible
text, styled runs, diagnostics, and `ansiEvidence`. An `ambiguous` result means
the only consumed control was an ESC-less empty reset (`[m`); composition
runtimes can preserve the original source unless another explicit ANSI control
is present.

Use `createCharDeskGeometrySnapshot(plain)` and
`compareCharDeskGeometry(plain, ansi)` when ANSI may add style but must not alter
visible text, grapheme boundaries, or cell positions.

## API

- `parseCharDeskText(source, options?)`
- `decodeCharDeskTextRuns(source, options?)`
- `layoutCharDeskTextRuns(runs, options?)`
- `stripCharDeskAnsi(source, options?)`
- `splitGraphemes(text)`
- `getGraphemeCellWidth(grapheme)`
- `getTextCellWidth(text)`
- `createCharDeskGeometrySnapshot(source, options?)`
- `compareCharDeskGeometry(plainText, ansiText, options?)`
- `formatCharDeskStyleNotes(cells, options?)`
- `CHARDESK_TEXT_PROTOCOL_VERSION`
- `UNICODE_DATA_VERSION`

The default syntax mode is `auto`; use `plain` to disable control parsing or `ansi` to force ESC-less numeric SGR parsing. The default tab size is four cells.

See [`fixtures/v1.json`](./fixtures/v1.json) for portable conformance cases. Parsed links are untrusted and must be sanitized by the renderer.

`formatCharDeskStyleNotes` merges adjacent attributed Cells into bounded style notes.
Coordinates are inclusive in the input coordinate space; default `y:x` notation preserves
CLI inspection output, while `{ coordinates: "explicit" }` uses `y=… x=…`.
At most 256 regions are shown; a truncation notice asks callers to narrow the viewport.

For CharDesk-compatible glyph coverage, renderers may use the optional [`@chardesk/fonts`](https://www.npmjs.com/package/@chardesk/fonts) profile.
