# Text

Render Unicode text in the Cell layout without browser text nodes.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, Text } from "@/lib/cell-ui";

<Root>
  <Text textStyle={{ bold: true }}>Hello, 世界</Text>
</Root>;
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [layout.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/layout.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `children` | `string \| number` | Text to lay out on integer Cells. |
| `textStyle?` | `CellTextStyle` | Cell foreground and text emphasis. |
| `style?` | `CellLayoutStyle` | Cell geometry and wrapping. |
