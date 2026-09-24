# Markdown

Render Markdown files as interactive Cell documents.

## Installation

Install the editable Cell UI source with the shared registry setup.

[Installation guide](https://ui.chardesk.com/#/guides/installation)

## Usage

```tsx
import { Markdown, Root } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

const source = "# Field Notes\n\nCells make docs readable.";

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

Links emit open-link for the application to handle. Task marks are read-only; images show alt text, and raw HTML stays inert.

| Prop | Type | Description |
| --- | --- | --- |
| `source` | `string` | Markdown source to render. |
| `id?` | `string` | Stable identity for the document root. |
| `style?` | `CellLayoutStyle` | Document layout overrides. |
