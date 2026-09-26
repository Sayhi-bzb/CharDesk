# ScrollArea

Scroll overflowing Cell content with keys, wheel, track, or thumb.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, ScrollArea, Text } from "@/lib/cell-ui";
import { CellSurface, useCellScrollState } from "@/lib/cell-ui/browser";

export function ScrollAreaExample() {
  const scroll = useCellScrollState();
  const offset = scroll.offset("rows");
  return (
    <CellSurface viewport={{ width: 32, height: 6 }} onCommand={scroll.dispatch}>
      <Root id="root">
        <ScrollArea
          id="rows"
          frame="bordered"
          scrollX={offset.x}
          scrollY={offset.y}
          style={{ height: 6 }}
        >
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
- [scroll-layout.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/scroll-layout.ts)
- [browser-scroll.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-scroll.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id?` | `string` | Stable scroll target identity. |
| `scrollX?` | `number` | Controlled horizontal Cell offset. |
| `scrollY?` | `number` | Controlled vertical Cell offset. |
| `useCellScrollState` | `CellScrollState` | Keeps both offsets and focus reveals by scroll target ID. |
| `variant?` | `"surface" \| "ghost"` | Local surface recipe; overrides the global recipe and otherwise defaults to ghost. |
| `frame?` | `"none" \| "bordered"` | Optional one-Cell border, independent of background. |
| `borderShape?` | `"square" \| "rounded"` | Border glyphs when the viewport is bordered. |
| `style?` | `CellLayoutStyle` | Viewport size and padding. |
