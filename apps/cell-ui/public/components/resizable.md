# Resizable

Compose Cell-native panes with constrained, application-owned Cell sizes.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Pane, Root, Split, Splitter, Text } from "@/lib/cell-ui";
import { CellSurface, useCellResizeHandle } from "@/lib/cell-ui/browser";

export function ResizableExample() {
  const [sizes, setSizes] = useState<readonly number[]>([20, 20]);
  const handle = useCellResizeHandle({
    orientation: "vertical",
    value: sizes[0]!,
    min: 8,
    max: 32,
    cellSize: 8,
    onChange: (value) => setSizes([value, 40 - value]),
  });

  return (
    <CellSurface viewport={{ width: 44, height: 8 }} onCommand={() => {}}>
      <Root>
        <Split orientation="horizontal" style={{ width: 42, height: 4 }}>
          <Pane style={{ width: sizes[0], height: 4 }}>
            <Text>Source</Text>
          </Pane>
          <Splitter orientation="vertical" />
          <Pane style={{ width: sizes[1], height: 4 }}>
            <Text>Preview</Text>
          </Pane>
        </Split>
      </Root>
    </CellSurface>
  );
}

// Render handle.props in a browser overlay at the Splitter bounds.
```

## Composition

```text
Split
├── Pane
├── Splitter
└── Pane
```

## View source

- [editor.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/editor.ts)
- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser.tsx)
- [browser-resize.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-resize.ts)
- [browser-viewport.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-viewport.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Split.orientation?` | `"horizontal" \| "vertical"` | Maps the composition direction to Cell rows or columns. |
| `Pane.minSize?` | `number` | Minimum Cell size used by the host sizing model. |
| `Pane.maxSize?` | `number` | Maximum Cell size used by the host sizing model. |
| `Pane.collapsible?` | `boolean` | Marks a pane as eligible for host-managed collapse. |
| `Pane.collapsed?` | `boolean` | Controlled collapsed state supplied by the application. |
| `Splitter.orientation?` | `"horizontal" \| "vertical"` | Cell separator direction; a vertical splitter separates horizontal panes. |
| `useCellResizeHandle` | `browser hook` | Pointer and keyboard handle contract for controlled Cell-size updates. |
| `createCellSplitModel` | `(panes: CellPaneSize[]) => CellSplitModel` | Pure Cell-size model for constrained adjacent-pane resize and collapse. |
| `CellPaneSize` | `{ size, minSize?, maxSize?, collapsed? }` | Application-owned Cell sizing input. |
