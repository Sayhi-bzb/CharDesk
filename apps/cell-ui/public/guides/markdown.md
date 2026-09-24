# Markdown

Render Markdown files as readable, interactive Cell documents—not browser HTML.

## Render a file

Load a Markdown file in your application and pass its contents to Markdown. The Cell viewport controls wrapping; the source stays with your application.

```tsx
import { Markdown, Root } from "@chardesk/cell-ui";

<Root>
  <Markdown id="readme" source={markdownSource} />
</Root>;
```

[Markdown implementation](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/markdown.ts)

## Character grammar

Headings keep their # level; lists, task marks, quotes, fences, and tables remain legible as Unicode. Color and emphasis reinforce structure but are not required to read it.

```md
# Field Notes

Cells make docs readable.

- [x] Build UI
- [ ] Share it

> Source stays yours.

Read [Philosophy](#/guides/philosophy).
```

## Links and source

A link is a focusable Cell target. Pointer, Enter, and assistive activation emit open-link with targetId and href; the application decides how to navigate. Cell Range copies visible Unicode, not the original Markdown source.

## Supported syntax

Common Markdown and GFM: headings, paragraphs, emphasis, links, lists and task marks, quotes, fenced code, rules, and tables. Images display alt text; raw HTML remains inert text. Task marks are read-only.
