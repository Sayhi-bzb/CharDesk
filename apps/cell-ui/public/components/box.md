# Box

Lay out Cell content and optionally give it a surface or frame.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Box, Root, Text } from "@/lib/cell-ui";

<Root><Box variant="ghost" frame="bordered" style={{ width: 20, padding: 1 }}>
  <Text>Content</Text>
</Box></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [visual.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/visual.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `variant?` | `"ghost" \| "surface"` | Transparent by default; surface fills with the elevated surface color. |
| `frame?` | `"none" \| "bordered"` | Bordered reserves one Cell on each edge. |
| `borderShape?` | `"square" \| "rounded"` | Glyph shape for a bordered frame. |
| `style?` | `CellLayoutStyle` | Cell geometry and layout. |
