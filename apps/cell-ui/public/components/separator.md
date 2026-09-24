# Separator

Separate Cell content with one row or column.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, Separator, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function SeparatorExample() {
  return <CellSurface viewport={{ width: 20, height: 3 }} onCommand={() => {}}>
    <Root><Text>Files</Text><Separator /><Text>Settings</Text></Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [separator.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/separator.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `variant?` | `"line" \| "slash" \| "double" \| "dots"` | Line by default; glyphs come from the global Cell UI theme. |
| `orientation?` | `"horizontal" \| "vertical"` | Horizontal by default; vertical fills its container height. |
| `style?` | `CellLayoutStyle` | Cell length and layout constraints. |
