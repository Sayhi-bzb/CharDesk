# Markdown

Keep Markdown source visible in Cells, with styling layered onto its content.

## Installation

Install the editable Cell UI source with the shared registry setup.

[Installation guide](https://ui.chardesk.com/#/guides/installation)

## Usage

```tsx
import { Markdown, Root } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

const source = "# Field Notes\n\n**Bold** and *italic* remain source text.";

export function MarkdownExample() {
  return (
    <CellSurface viewport={{ width: 40, height: 12 }}>
      <Root>
        <Markdown source={source} />
      </Root>
    </CellSurface>
  );
}
```

## View source

- [markdown.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/markdown.ts)
- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)

## API

Source markers remain visible. Inline code uses inverse colors; tables align columns and short rules center without changing Cell Range copy. Paragraphs may wrap. Safe links remain interactive; raw HTML stays inert.

| Prop | Type | Description |
| --- | --- | --- |
| `source` | `string` | Markdown source to render. |
| `id?` | `string` | Stable identity for the document root. |
| `style?` | `CellLayoutStyle` | Document layout overrides. |
