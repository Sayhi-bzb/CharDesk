# Overlay

Place a named Cell surface above the base Scene.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Overlay, Root, Text } from "@/lib/cell-ui";

<Root><Overlay id="palette" label="Command palette" position={{ x: 2, y: 1 }}
  style={{ width: 28, height: 6 }}>
  <Text>Commands</Text>
</Overlay></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [anchored-overlay.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/anchored-overlay.ts)
- [interaction.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/interaction.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `position` | `CellPoint` | Placement in viewport Cells. |
| `modal?` | `boolean` | Constrain focus and background semantics. |
| `closeOnOutsideClick?` | `boolean` | Emit dismiss on outside pointer down; true by default. |
| `variant? / frame?` | `SurfaceVariant / CellFrame` | Surface background and frame are independent. |
