# ScrollArea

Scroll overflowing Cell content with keys, wheel, track, or thumb.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Root, ScrollArea, Text, type WidgetCommand } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function ScrollAreaExample() {
  const [scrollY, setScrollY] = useState(0);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "scroll") setScrollY(command.scrollY);
  };
  return (
    <CellSurface viewport={{ width: 32, height: 6 }} onCommand={dispatch}>
      <Root id="root">
        <ScrollArea frame="bordered" scrollY={scrollY} style={{ height: 6 }}>
          {Array.from({ length: 10 }, (_, index) => (
            <Text key={index}>Row {index + 1}</Text>
          ))}
        </ScrollArea>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [scroll.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/scroll.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id?` | `string` | Stable scroll target identity. |
| `scrollX?` | `number` | Controlled horizontal Cell offset. |
| `scrollY?` | `number` | Controlled vertical Cell offset. |
| `variant?` | `"surface" \| "ghost"` | Local surface recipe; overrides the global recipe and otherwise defaults to ghost. |
| `frame?` | `"none" \| "bordered"` | Optional one-Cell border, independent of background. |
| `borderShape?` | `"square" \| "rounded"` | Border glyphs when the viewport is bordered. |
| `style?` | `CellLayoutStyle` | Viewport size and padding. |
