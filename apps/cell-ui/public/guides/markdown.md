# Markdown

Read Markdown as a Cell-native document. This Gallery publishes its source .md pages through llms.txt.

## Preview source

````md
# Field Notes

Cells make **structure** readable. Try *emphasis* and `inline code`.

Read [Philosophy](#/guides/philosophy).

## Checklist

- [x] Build UI
- [ ] Share it
- Keep notes
  - Include the details

## Steps

1. Write Markdown
2. Render Cells

> Source stays yours.

---

## Code

```ts
const ready = true;
```

## Table

| Element | Cell output |
| :--- | ---: |
| Link | Focusable |
| List | Structured |

Read [Installation](#/guides/installation).

## Fallbacks

~~Old wording~~ stays visible.

![Flow diagram](flow.png)
````

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

Markdown renders for reading. Headings keep plain hashes; tables use aligned columns, │ separators, and a header rule; thematic breaks render as /////. Cell Range copies visible text. Code fences stay hidden; safe links stay interactive; raw HTML stays inert.

[Theming](https://ui.chardesk.com/#/guides/theming)

| Prop | Type | Description |
| --- | --- | --- |
| `source` | `string` | Markdown source to render. |
| `id?` | `string` | Stable identity for the document root. |
| `style?` | `CellLayoutStyle` | Document layout overrides. |
| `renderCodeBlock?` | `(block: MarkdownCodeBlock) => ReactElement` | Replace a code block with Cell descriptors. The block includes raw source, code, language, and line bounds. |
| `highlightCodeLine?` | `(line: string, lineIndex: number) => MarkdownCodeToken[]` | Color code tokens without changing their text. Invalid token coverage falls back to the original line. |
