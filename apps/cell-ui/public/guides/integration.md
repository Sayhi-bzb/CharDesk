# Integration

Connect Cell descriptors, browser projection, and application-owned state.

## Surface

Import descriptors and CellUiRuntime from @/lib/cell-ui; import CellSurface and state adapters from @/lib/cell-ui/browser. Root is the top-level structural descriptor. CellSurface retains the runtime across viewport, theme, and presentation changes. Presentation defaults to rich; text is an equally interactive Unicode rendering of the same state and commands.

```tsx
import { Root, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

<CellSurface
  viewport={{ width: 30, height: 4 }}
  presentation="text"
  onCommand={dispatch}
>
  <Root>
    <Text>Hello, Cells</Text>
  </Root>
</CellSurface>;
```

## State and commands

Application state remains outside the renderer. Pass controlled values and focused IDs into descriptors, then handle CellSurface onCommand or use the matching /browser state adapter. Direct adapter dispatch has no presentation lifecycle.

## Headless hosts

CellUiRuntime commits a dense Cell buffer and Scene without a browser. Headless hosts supply viewport, state, focus, and animationTimeMs explicitly. The browser adapter supplies font loading, pointer, input, and semantic focus.
